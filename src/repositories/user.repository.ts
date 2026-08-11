import pool from "../config/db.config";

export const userRepository = {
  async findByEmail(email: string) {
    const query = `
      SELECT id, email, password_hash, rol_principal, zona_id, puntuacion, cuenta_mercadopago, creado_en, actualizado_en
      FROM usuarios
      WHERE email = $1;
    `;
    const result = await pool.query(query, [email]);
    return result.rows[0] || null;
  },

  async createUser(userData: {
    email: string;
    passwordHash: string;
    rolPrincipal: string;
    zonaId?: number;
    georefLocalidadId?: string;
  }) {
    const query = `
      INSERT INTO usuarios (email, password_hash, rol_principal, zona_id, georef_localidad_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, rol_principal, zona_id, creado_en;
    `;

    const values = [
      userData.email,
      userData.passwordHash,
      userData.rolPrincipal,
      userData.zonaId || null,
      userData.georefLocalidadId || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async findById(id: string) {
    const query = `
      SELECT 
        u.id, u.email, u.rol_principal, u.zona_id, u.puntuacion,
        u.cuenta_mercadopago, u.tagline, u.descripcion, u.experiencia,
        u.actualizado_en, u.georef_localidad_id,
        COALESCE(
          json_agg(
            json_build_object('id', m.id, 'material', m.material, 'disponible', m.disponible)
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'
        ) AS materiales
      FROM usuarios u
      LEFT JOIN materiales m ON m.usuario_id = u.id
      WHERE u.id = $1
      GROUP BY u.id;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  },

  async updateUser(
    id: string,
    data: {
      tagline?: string;
      descripcion?: string;
      experiencia?: string;
      zonaId?: number;
      cuentaMercadopago?: string;
      georefLocalidadId?: string;
    },
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.tagline !== undefined) {
      fields.push(`tagline = $${idx++}`);
      values.push(data.tagline);
    }
    if (data.descripcion !== undefined) {
      fields.push(`descripcion = $${idx++}`);
      values.push(data.descripcion);
    }
    if (data.experiencia !== undefined) {
      fields.push(`experiencia = $${idx++}`);
      values.push(data.experiencia);
    }
    if (data.zonaId !== undefined) {
      fields.push(`zona_id = $${idx++}`);
      values.push(data.zonaId);
    }
    if (data.cuentaMercadopago !== undefined) {
      fields.push(`cuenta_mercadopago = $${idx++}`);
      values.push(data.cuentaMercadopago);
    }
    if (data.georefLocalidadId !== undefined) {
      fields.push(`georef_localidad_id = $${idx++}`);
      values.push(data.georefLocalidadId);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`actualizado_en = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE usuarios SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id;`;
    await pool.query(query, values);
    return this.findById(id);
  },

  async setMateriales(usuarioId: string, materiales: string[]) {
    await pool.query(`DELETE FROM materiales WHERE usuario_id = $1`, [
      usuarioId,
    ]);
    if (materiales.length > 0) {
      const placeholders = materiales
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await pool.query(
        `INSERT INTO materiales (usuario_id, material) VALUES ${placeholders}`,
        [usuarioId, ...materiales],
      );
    }
    const result = await pool.query(
      `SELECT id, material, disponible FROM materiales WHERE usuario_id = $1 ORDER BY id`,
      [usuarioId],
    );
    return result.rows;
  },
};
