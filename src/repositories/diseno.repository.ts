import pool from "../config/db.config";

const COLUMN_MAP: Record<string, string> = {
  imagenUrl: "imagen_url",
  archivoUrl: "archivo_url",
  precioBase: "precio_base",
};

interface DisenoEspecificaciones {
  material: string;
  dimensiones: string;
  dificultad: string;
  tiempoImpresion: string;
  soportes: string;
  configuracion: {
    layer: string;
    infill: string;
  };
}

export const disenoRepository = {
  async getAllProducts() {
    const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.archivo_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id;
    `;
    const result = await pool.query(query);
    return result.rows;
  },

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
      ? `SELECT COUNT(*) FROM disenos d LEFT JOIN categorias c ON d.categoria_id = c.id WHERE c.nombre = $1`
      : `SELECT COUNT(*) FROM disenos;`;
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

    const categoriaParamIndex = categoria ? (zona ? 5 : 3) : null;

    const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.archivo_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      ${categoriaParamIndex !== null ? `WHERE c.nombre = $${categoriaParamIndex}` : ""}
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

  async getByIdWithDesigner(id: string) {
    const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.archivo_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        d.disenador_id,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      WHERE d.id = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  async createProduct(productData: {
    disenadorId: string;
    titulo: string;
    descripcion?: string;
    imagenUrl?: string;
    archivoUrl: string;
    precioBase: number;
    formato?: string;
    especificaciones?: DisenoEspecificaciones;
    categoria?: string;
  }) {
    let categoriaId: number | null = null;
    if (productData.categoria) {
      await pool.query(
        `INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`,
        [productData.categoria],
      );
      const catResult = await pool.query<{ id: number }>(
        `SELECT id FROM categorias WHERE nombre = $1`,
        [productData.categoria],
      );
      categoriaId = catResult.rows[0]?.id ?? null;
    }
    const query = `
      INSERT INTO disenos (
        disenador_id, titulo, descripcion, imagen_url, 
        archivo_url, precio_base, formato, especificaciones, categoria_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      categoriaId,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async updateProduct(
    id: string,
    productData: {
      titulo: string;
      descripcion?: string;
      imagenUrl?: string;
      archivoUrl: string;
      precioBase: number;
      formato?: string;
      especificaciones?: DisenoEspecificaciones;
      categoria?: string;
    },
  ) {
    let categoriaId: number | null = null;
    if (productData.categoria) {
      await pool.query(
        `INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`,
        [productData.categoria],
      );
      const catResult = await pool.query<{ id: number }>(
        `SELECT id FROM categorias WHERE nombre = $1`,
        [productData.categoria],
      );
      categoriaId = catResult.rows[0]?.id ?? null;
    }
    const query = `
      UPDATE disenos 
      SET titulo = $1, descripcion = $2, imagen_url = $3, archivo_url = $4,
          precio_base = $5, formato = $6, especificaciones = $7, categoria_id = $8
      WHERE id = $9
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
      categoriaId,
      id,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async partialUpdateProduct(id: string, updates: any) {
    const fields = [];
    const values = [];
    let queryIndex = 1;

    let categoriaId: number | null | undefined = undefined;
    if ("categoria" in updates) {
      if (updates.categoria) {
        await pool.query(
          `INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`,
          [updates.categoria],
        );
        const catResult = await pool.query<{ id: number }>(
          `SELECT id FROM categorias WHERE nombre = $1`,
          [updates.categoria],
        );
        categoriaId = catResult.rows[0]?.id ?? null;
      } else {
        categoriaId = null;
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      if (key === "categoria") continue;

      const dbCol = COLUMN_MAP[key] ?? key;

      fields.push(`${dbCol} = $${queryIndex}`);
      values.push(key === "especificaciones" ? JSON.stringify(value) : value);
      queryIndex++;
    }

    if (categoriaId !== undefined) {
      fields.push(`categoria_id = $${queryIndex}`);
      values.push(categoriaId);
      queryIndex++;
    }

    if (fields.length === 0) return null;

    values.push(id);

    const query = `
      UPDATE disenos 
      SET ${fields.join(", ")} 
      WHERE id = $${queryIndex}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async deleteProduct(id: string) {
    const query = `DELETE FROM disenos WHERE id = $1 RETURNING id;`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  async getById(id: string) {
    const query = `SELECT * FROM disenos WHERE id = $1;`;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  async getByDesigner(designerId: string) {
    const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.archivo_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        u.zona_id AS designer_zona_id,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      WHERE d.disenador_id = $1;
    `;
    const result = await pool.query(query, [designerId]);
    return result.rows;
  },
};
