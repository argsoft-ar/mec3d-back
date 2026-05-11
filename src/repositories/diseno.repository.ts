import pool from '../config/db.config';

export const disenoRepository = {
  async getAllProducts() {
    const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        -- Extraemos el nombre del email asumiendo que es temporal, o bien un campo nombre
        split_part(u.email, '@', 1) AS designer_name
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id;
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  async createProduct(productData: {
    disenadorId: string;
    titulo: string;
    descripcion?: string;
    imagenUrl?: string;
    archivoUrl: string;
    precioBase: number;
    formato?: string;
    especificaciones?: object[];
  }) {
    const query = `
      INSERT INTO disenos (
        disenador_id, titulo, descripcion, imagen_url, 
        archivo_url, precio_base, formato, especificaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
      productData.especificaciones ? JSON.stringify(productData.especificaciones) : null
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async updateProduct(id: string, productData: any) {
    const query = `
      UPDATE disenos 
      SET titulo = $1, descripcion = $2, imagen_url = $3, archivo_url = $4,
          precio_base = $5, formato = $6, especificaciones = $7, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *;
    `;
    const values = [
      productData.titulo,
      productData.descripcion || null,
      productData.imagenUrl || null,
      productData.archivoUrl,
      productData.precioBase,
      productData.formato || null,
      productData.especificaciones ? JSON.stringify(productData.especificaciones) : null,
      id
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async partialUpdateProduct(id: string, updates: any) {
    // Construimos la query dinámicamente según los campos que vengan
    const fields = [];
    const values = [];
    let queryIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      // Mapeamos los nombres del body a las columnas de la BD
      const dbCol = key === 'imagenUrl' ? 'imagen_url' : 
                    key === 'archivoUrl' ? 'archivo_url' : 
                    key === 'precioBase' ? 'precio_base' : key;
      
      fields.push(`${dbCol} = $${queryIndex}`);
      values.push(key === 'especificaciones' ? JSON.stringify(value) : value);
      queryIndex++;
    }

    if (fields.length === 0) return null;

    fields.push('actualizado_en = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE disenos 
      SET ${fields.join(', ')} 
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
  }
};
