import type { PoolClient } from "pg";
import pool from "../config/db.config";

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

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function replaceMateriales(
  client: PoolClient,
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
    zona?: {
      zonaId: number;
      provinciaPrefix: string | null;
      partidoPrefix: string | null;
    },
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

    // Con zona: prioriza misma zona (0), misma provincia por prefijo INDEC (1) y el resto (2).
    // zona_id es INTEGER, por lo que los códigos de provincias 01-09 pierden el cero inicial:
    // localidad canónica = 8 dígitos (7 sin cero), departamento = 5 dígitos (4 sin cero).
    const orderByZona = `
      ORDER BY
        CASE
          WHEN $4::text IS NOT NULL AND u.zona_id IS NOT NULL AND (
            CASE
              WHEN length(u.zona_id::text) = 8 THEN substring(u.zona_id::text, 1, 5)
              WHEN length(u.zona_id::text) = 7 THEN '0' || substring(u.zona_id::text, 1, 4)
            END
          ) = $4::text THEN 0
          WHEN $3::text IS NOT NULL AND u.zona_id IS NOT NULL AND (
            CASE
              WHEN length(u.zona_id::text) IN (8, 5) THEN substring(u.zona_id::text, 1, 2)
              WHEN length(u.zona_id::text) IN (7, 4) THEN '0' || substring(u.zona_id::text, 1, 1)
            END
          ) = $3::text THEN 1
          ELSE 2
        END,
        d.creado_en DESC
    `;

    let categoriaParamIndex: number | null = null;
    if (categoria) {
      categoriaParamIndex = zona ? 5 : 3;
    }

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
      JOIN tecnologias t ON t.id = d.tecnologia_id
      WHERE d.eliminado_en IS NULL
      ${categoriaParamIndex !== null ? `AND c.nombre = $${categoriaParamIndex}` : ""}
      ${zona ? orderByZona : "ORDER BY d.creado_en DESC"}
      LIMIT $1 OFFSET $2;
    `;
    const values: (number | string | null)[] = [limit, offset];
    if (zona) {
      values.push(zona.provinciaPrefix, zona.partidoPrefix);
    }
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
      JOIN tecnologias t ON t.id = d.tecnologia_id
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
    tecnologiaId: number;
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
      tecnologiaId: number;
      materialIds: number[];
    },
  ) {
    return withTransaction(async (client) => {
      const query = `
        UPDATE disenos
        SET titulo = $1, descripcion = $2, imagen_url = $3, archivo_url = $4,
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
      if (row) await replaceMateriales(client, id, productData.materialIds);
      return row;
    });
  },

  // `updates` solo conserva claves de PARTIAL_UPDATE_ALLOWED_KEYS;
  // `materialIds`, si viene, reemplaza los materiales del diseño.
  async partialUpdateProduct(
    id: string,
    disenadorId: string,
    updates: Record<string, unknown>,
    materialIds?: number[],
  ) {
    return withTransaction(async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let queryIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (!PARTIAL_UPDATE_ALLOWED_KEYS.has(key)) continue;

        const dbCol = COLUMN_MAP[key] ?? key;

        fields.push(`${dbCol} = $${queryIndex}`);
        values.push(key === "especificaciones" ? JSON.stringify(value) : value);
        queryIndex++;
      }

      if (fields.length === 0 && materialIds === undefined) return null;

      let row;
      if (fields.length > 0) {
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
      }

      if (row && materialIds !== undefined) {
        await replaceMateriales(client, id, materialIds);
      }
      return row;
    });
  },

  async deleteProduct(id: string, disenadorId: string) {
    // Soft-delete: una compra puede referenciar este diseño (FK compras.id_modelo),
    // por lo que nunca se hace DELETE físico, solo se marca eliminado_en.
    const query = `
      UPDATE disenos SET eliminado_en = now()
      WHERE id = $1 AND disenador_id = $2 AND eliminado_en IS NULL
      RETURNING id;
    `;
    const result = await pool.query(query, [id, disenadorId]);
    return result.rows[0];
  },

  async getById(id: string) {
    const query = `SELECT * FROM disenos WHERE id = $1;`;
    const result = await pool.query(query, [id]);
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
      JOIN tecnologias t ON t.id = d.tecnologia_id
      WHERE d.disenador_id = $1 AND d.eliminado_en IS NULL;
    `;
    const result = await pool.query(query, [designerId]);
    return result.rows;
  },
};
