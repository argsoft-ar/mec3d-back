import pool from "../config/db.config";
import { Db, withTransaction } from "../utils/transaction.util";

const COLUMN_MAP: Record<string, string> = {
  imagenUrl: "imagen_url",
  archivoUrl: "archivo_url",
  precioBase: "precio_base",
  tecnologiaId: "tecnologia_id",
  categoriaId: "categoria_id",
};

// Allowlist estricta de columnas actualizables por partialUpdateProduct: los nombres de
// columna se interpolan directo en el SQL (no se pueden parametrizar), así que se valida
// contra este set cerrado en vez de confiar en las claves del objeto `updates` recibido
// (defensa en profundidad ante mass-assignment / inyección de nombre de columna).
// `tecnologiaId` y `categoriaId` los resuelve el service desde el nombre (catálogo); los
// materiales no son columna de disenos y viajan por el parámetro `materialIds`.
const PARTIAL_UPDATE_ALLOWED_KEYS = new Set([
  "titulo",
  "descripcion",
  "imagenUrl",
  "archivoUrl",
  "precioBase",
  "formato",
  "especificaciones",
  "tecnologiaId",
  "categoriaId",
]);

// Nombre público del diseñador: nunca se deriva del email (PII).
const DESIGNER_NAME_COLUMN = `u.username AS designer_name`;

// Columnas extra del SELECT: tecnología y materiales (desde la tabla puente) del diseño.
const TECNOLOGIA_MATERIALES_COLUMNS = `
        d.tecnologia_id,
        t.nombre AS tecnologia_nombre,
        COALESCE(
          (SELECT array_agg(m.nombre ORDER BY m.nombre)
           FROM diseno_materiales dm
           JOIN materiales m ON m.id = dm.material_id
           WHERE dm.diseno_id = d.id),
          ARRAY[]::text[]
        ) AS materiales_nombres`;

interface DisenoEspecificaciones {
  dimensiones: string;
  dificultad: string;
  tiempoImpresion: number;
  soportes: string;
  configuracion: {
    layer: string;
    infill: string;
  };
}

// Con `db` (cliente de una transacción del caller) participa de ella; sin él abre la propia.
function enTransaccion<T>(
  db: Db | undefined,
  fn: (client: Db) => Promise<T>,
): Promise<T> {
  return db ? fn(db) : withTransaction(fn);
}

// Bloquea la fila (FOR UPDATE) y lee su preview_url dentro de la transacci\u00f3n de escritura: la clave
// vieja a descartar es la vigente al escribir, no una le\u00edda antes (evita objetos hu\u00e9rfanos).
async function bloquearPreviewActual(
  client: Db,
  id: string,
  disenadorId: string,
): Promise<{ preview_url: string | null } | undefined> {
  const result = await client.query(
    `SELECT preview_url FROM disenos
     WHERE id = $1 AND disenador_id = $2 AND eliminado_en IS NULL
     FOR UPDATE;`,
    [id, disenadorId],
  );
  return result.rows[0];
}

async function replaceMateriales(
  client: Db,
  disenoId: string,
  materialIds: number[],
): Promise<void> {
  await client.query(`DELETE FROM diseno_materiales WHERE diseno_id = $1`, [
    disenoId,
  ]);
  await client.query(
    `INSERT INTO diseno_materiales (diseno_id, material_id)
     SELECT $1::uuid, unnest($2::int[])`,
    [disenoId, materialIds],
  );
}

export const disenoRepository = {
  // Listado público: NO incluye archivo_url (el archivo de pago no se expone).
  async getAllProductsPaginated(
    limit: number,
    offset: number,
    categoria?: string,
  ): Promise<{ rows: any[]; total: number }> {
    const countQuery = categoria
      ? `SELECT COUNT(*) FROM disenos d LEFT JOIN categorias c ON d.categoria_id = c.id WHERE c.nombre = $1 AND d.eliminado_en IS NULL`
      : `SELECT COUNT(*) FROM disenos WHERE eliminado_en IS NULL;`;
    const countResult = await pool.query(
      countQuery,
      categoria ? [categoria] : [],
    );
    const total = Number.parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating,
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        ${DESIGNER_NAME_COLUMN},
        c.nombre AS categoria_nombre,
        ${TECNOLOGIA_MATERIALES_COLUMNS}
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      LEFT JOIN tecnologias t ON t.id = d.tecnologia_id
      WHERE d.eliminado_en IS NULL
      ${categoria ? "AND c.nombre = $3" : ""}
      ORDER BY d.creado_en DESC
      LIMIT $1 OFFSET $2;
    `;
    const values: (number | string)[] = [limit, offset];
    if (categoria) {
      values.push(categoria);
    }
    const result = await pool.query(query, values);
    return { rows: result.rows, total };
  },

  // archivo_url solo se selecciona para el dueño (respuestas de create/update); nunca en lecturas públicas.
  async getByIdWithDesigner(
    id: string,
    opts: { incluirArchivo?: boolean } = {},
  ) {
    const query = `
      SELECT
        d.id, d.titulo, d.descripcion, d.imagen_url, ${opts.incluirArchivo ? "d.archivo_url," : ""} d.rating,
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        d.disenador_id,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        ${DESIGNER_NAME_COLUMN},
        c.nombre AS categoria_nombre,
        ${TECNOLOGIA_MATERIALES_COLUMNS}
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      LEFT JOIN tecnologias t ON t.id = d.tecnologia_id
      WHERE d.id = $1 AND d.eliminado_en IS NULL;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Escritura multi-tabla (disenos + diseno_materiales) atómica.
  async createProduct(productData: {
    disenadorId: string;
    titulo: string;
    descripcion?: string;
    imagenUrl?: string;
    archivoUrl: string;
    precioBase: number;
    formato?: string;
    especificaciones?: DisenoEspecificaciones;
    categoriaId: number | null;
    tecnologiaId: number | null;
    materialIds: number[];
  }) {
    return withTransaction(async (client) => {
      const query = `
        INSERT INTO disenos (
          disenador_id, titulo, descripcion, imagen_url, 
          archivo_url, precio_base, formato, especificaciones, categoria_id,
          tecnologia_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const values = [
        productData.disenadorId,
        productData.titulo,
        productData.descripcion || null,
        productData.imagenUrl || null,
        productData.archivoUrl,
        productData.precioBase,
        productData.formato || null,
        productData.especificaciones
          ? JSON.stringify(productData.especificaciones)
          : null,
        productData.categoriaId,
        productData.tecnologiaId,
      ];
      const result = await client.query(query, values);
      const row = result.rows[0];
      await replaceMateriales(client, row.id, productData.materialIds);
      return row;
    });
  },

  // Defensa en profundidad: el WHERE exige dueño y no-eliminado además del chequeo del service.
  async updateProduct(
    id: string,
    disenadorId: string,
    productData: {
      titulo: string;
      descripcion?: string;
      imagenUrl?: string;
      archivoUrl: string;
      precioBase: number;
      formato?: string;
      especificaciones?: DisenoEspecificaciones;
      categoriaId: number | null;
      tecnologiaId: number | null;
      materialIds: number[];
    },
    db?: Db,
  ) {
    return enTransaccion(db, async (client) => {
      const anterior = await bloquearPreviewActual(client, id, disenadorId);
      if (!anterior) return undefined;
      const query = `
        UPDATE disenos
        SET titulo = $1, descripcion = $2, imagen_url = $3,
            preview_url = CASE WHEN archivo_url IS DISTINCT FROM $4 THEN NULL ELSE preview_url END,
            archivo_url = $4,
            precio_base = $5, formato = $6, especificaciones = $7, categoria_id = $8,
            tecnologia_id = $9
        WHERE id = $10 AND disenador_id = $11 AND eliminado_en IS NULL
        RETURNING *;
      `;
      const values = [
        productData.titulo,
        productData.descripcion || null,
        productData.imagenUrl || null,
        productData.archivoUrl,
        productData.precioBase,
        productData.formato || null,
        productData.especificaciones
          ? JSON.stringify(productData.especificaciones)
          : null,
        productData.categoriaId,
        productData.tecnologiaId,
        id,
        disenadorId,
      ];
      const result = await client.query(query, values);
      const row = result.rows[0];
      if (!row) return row;
      await replaceMateriales(client, id, productData.materialIds);
      return { ...row, preview_url_anterior: anterior.preview_url };
    });
  },

  // `updates` solo conserva claves de PARTIAL_UPDATE_ALLOWED_KEYS;
  // `materialIds`, si viene, reemplaza los materiales del diseño.
  async partialUpdateProduct(
    id: string,
    disenadorId: string,
    updates: Record<string, unknown>,
    materialIds?: number[],
    db?: Db,
  ) {
    return enTransaccion(db, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let queryIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (!PARTIAL_UPDATE_ALLOWED_KEYS.has(key)) continue;

        const dbCol = COLUMN_MAP[key] ?? key;

        // Un archivo nuevo invalida el preview del anterior (el service lo regenera).
        if (key === "archivoUrl") {
          fields.push(
            `preview_url = CASE WHEN archivo_url IS DISTINCT FROM $${queryIndex} THEN NULL ELSE preview_url END`,
          );
        }
        fields.push(`${dbCol} = $${queryIndex}`);
        values.push(key === "especificaciones" ? JSON.stringify(value) : value);
        queryIndex++;
      }

      if (fields.length === 0 && materialIds === undefined) return null;

      let row;
      let previewAnterior: string | null = null;
      if (fields.length > 0) {
        const anterior = await bloquearPreviewActual(client, id, disenadorId);
        if (!anterior) return undefined;
        previewAnterior = anterior.preview_url;
        values.push(id, disenadorId);
        const result = await client.query(
          `UPDATE disenos
           SET ${fields.join(", ")}
           WHERE id = $${queryIndex} AND disenador_id = $${queryIndex + 1}
             AND eliminado_en IS NULL
           RETURNING *;`,
          values,
        );
        row = result.rows[0];
      } else {
        const result = await client.query(
          `SELECT * FROM disenos
           WHERE id = $1 AND disenador_id = $2 AND eliminado_en IS NULL
           FOR UPDATE;`,
          [id, disenadorId],
        );
        row = result.rows[0];
        previewAnterior = row?.preview_url ?? null;
      }

      if (!row) return row;
      if (materialIds !== undefined) {
        await replaceMateriales(client, id, materialIds);
      }
      return { ...row, preview_url_anterior: previewAnterior };
    });
  },

  // Soft-delete: una compra puede referenciar este diseño (FK compras.id_modelo),
  // por lo que nunca se hace DELETE físico, solo se marca eliminado_en.
  // Devuelve preview_url tal como estaba al borrar (la fila queda bloqueada por el UPDATE).
  async deleteProduct(id: string, disenadorId: string) {
    const query = `
      UPDATE disenos SET eliminado_en = now()
      WHERE id = $1 AND disenador_id = $2 AND eliminado_en IS NULL
      RETURNING id, preview_url;
    `;
    const result = await pool.query(query, [id, disenadorId]);
    return result.rows[0];
  },

  async getById(id: string, db: Db = pool) {
    // categoria_nombre permite decidir reglas por categoría (planos técnicos) sin otra consulta.
    const query = `
      SELECT d.*, c.nombre AS categoria_nombre
      FROM disenos d
      LEFT JOIN categorias c ON c.id = d.categoria_id
      WHERE d.id = $1;`;
    const result = await db.query(query, [id]);
    return result.rows[0] ?? null;
  },

  // Lock de fila del diseño dentro de una transacción: serializa el cambio a "Planos técnicos"
  // con la creación de compras de fabricación. Devuelve la misma forma que getById.
  async lockById(db: Db, id: string) {
    const result = await db.query(
      `SELECT d.*, c.nombre AS categoria_nombre
       FROM disenos d
       LEFT JOIN categorias c ON c.id = d.categoria_id
       WHERE d.id = $1
       FOR UPDATE OF d;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  // Datos para autorizar el acceso al archivo de pago. No filtra por eliminado_en: una
  // compra pagada u orden en curso conserva el acceso aunque el diseño se haya dado de baja.
  // es_comprador solo vale para compras de descarga pagadas/completadas: el comprador de una
  // fabricación no accede al archivo (lo recibe el fabricante asignado con la compra pagada).
  async getAccesoArchivo(
    id: string,
    userId: string,
  ): Promise<{
    archivo_url: string;
    disenador_id: string;
    eliminado_en: Date | null;
    es_comprador: boolean;
    es_fabricante: boolean;
  } | null> {
    const result = await pool.query(
      `SELECT d.archivo_url, d.disenador_id, d.eliminado_en,
              EXISTS (
                SELECT 1 FROM compras c
                WHERE c.id_modelo = d.id AND c.id_comprador = $2
                  AND c.tipo = 'descarga'
                  AND c.estado IN ('pagada', 'completada')
              ) AS es_comprador,
              EXISTS (
                SELECT 1 FROM ordenes_fabricacion o
                JOIN compras c ON c.id = o.compra_id
                WHERE c.id_modelo = d.id AND o.fabricante_id = $2
                  AND c.tipo = 'fabricacion'
                  AND o.estado IN ('trato_cerrado', 'confirmada')
                  AND c.estado = 'pagada'
              ) AS es_fabricante
       FROM disenos d
       WHERE d.id = $1;`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  },

  // Único lector de preview_url para el endpoint público: nunca selecciona archivo_url.
  async getPreviewPublico(
    id: string,
  ): Promise<{
    preview_url: string | null;
    categoria_nombre: string | null;
  } | null> {
    const result = await pool.query(
      `SELECT d.preview_url, c.nombre AS categoria_nombre
       FROM disenos d
       LEFT JOIN categorias c ON c.id = d.categoria_id
       WHERE d.id = $1 AND d.eliminado_en IS NULL;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  // Guarda el preview solo si el archivo sigue siendo el que se procesó y no hay preview (o, con
  // `reemplazarDe`, si el preview vigente sigue siendo esa clave): con dos generaciones
  // concurrentes gana la primera y la otra borra su objeto.
  async setPreviewUrl(
    id: string,
    archivoUrl: string,
    previewKey: string,
    reemplazarDe?: string,
  ): Promise<boolean> {
    const result = reemplazarDe
      ? await pool.query(
          `UPDATE disenos SET preview_url = $3
           WHERE id = $1 AND archivo_url = $2 AND preview_url = $4 AND eliminado_en IS NULL;`,
          [id, archivoUrl, previewKey, reemplazarDe],
        )
      : await pool.query(
          `UPDATE disenos SET preview_url = $3
           WHERE id = $1 AND archivo_url = $2 AND preview_url IS NULL AND eliminado_en IS NULL;`,
          [id, archivoUrl, previewKey],
        );
    return (result.rowCount ?? 0) > 0;
  },

  // Quita el preview solo si sigue siendo `previewKey` (no pisa uno regenerado en el medio).
  async clearPreviewUrl(id: string, previewKey: string): Promise<void> {
    await pool.query(
      `UPDATE disenos SET preview_url = NULL WHERE id = $1 AND preview_url = $2;`,
      [id, previewKey],
    );
  },

  // Backfill: diseños activos sin preview, excluyendo planos técnicos; paginado por id.
  async listarSinPreview(
    despuesDeId: string,
    limit: number,
    categoriaPlano: string,
  ): Promise<{ id: string; archivo_url: string }[]> {
    const result = await pool.query(
      `SELECT d.id, d.archivo_url
       FROM disenos d
       LEFT JOIN categorias c ON c.id = d.categoria_id
       WHERE d.preview_url IS NULL AND d.eliminado_en IS NULL AND d.id > $1
         AND (c.nombre IS NULL OR lower(c.nombre) <> lower($3))
       ORDER BY d.id
       LIMIT $2;`,
      [despuesDeId, limit, categoriaPlano],
    );
    return result.rows;
  },

  // Backfill --force: todos los diseños activos (con o sin preview), sin planos técnicos; paginado por id.
  async listarParaRegenerar(
    despuesDeId: string,
    limit: number,
    categoriaPlano: string,
  ): Promise<
    { id: string; archivo_url: string; preview_url: string | null }[]
  > {
    const result = await pool.query(
      `SELECT d.id, d.archivo_url, d.preview_url
       FROM disenos d
       LEFT JOIN categorias c ON c.id = d.categoria_id
       WHERE d.eliminado_en IS NULL AND d.id > $1
         AND (c.nombre IS NULL OR lower(c.nombre) <> lower($3))
       ORDER BY d.id
       LIMIT $2;`,
      [despuesDeId, limit, categoriaPlano],
    );
    return result.rows;
  },

  // Solo para el dueño ("mis diseños"): es el único listado que incluye archivo_url.
  async getByDesigner(designerId: string) {
    const query = `
      SELECT
        d.id, d.titulo, d.descripcion, d.imagen_url, d.archivo_url, d.rating,
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        ${DESIGNER_NAME_COLUMN},
        c.nombre AS categoria_nombre,
        ${TECNOLOGIA_MATERIALES_COLUMNS}
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      LEFT JOIN tecnologias t ON t.id = d.tecnologia_id
      WHERE d.disenador_id = $1 AND d.eliminado_en IS NULL;
    `;
    const result = await pool.query(query, [designerId]);
    return result.rows;
  },
};
