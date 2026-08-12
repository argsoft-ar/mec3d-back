import pool from "../config/db.config";
import {
  Material,
  Tecnologia,
  UpdateProfileDTO,
} from "../interfaces/user.interface";

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
      SELECT id, email, rol_principal, zona_id, puntuacion, cuenta_mercadopago,
             tagline, descripcion, experiencia, creado_en, actualizado_en,
             georef_localidad_id
      FROM usuarios
      WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  },

  async updateProfile(id: string, data: UpdateProfileDTO) {
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

    const query = `
      UPDATE usuarios
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, email, rol_principal, zona_id, puntuacion, cuenta_mercadopago,
                tagline, descripcion, experiencia, actualizado_en, georef_localidad_id;
    `;
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  },

  async getMaterialesFabricante(fabricanteId: string): Promise<Material[]> {
    const query = `
      SELECT id, material, disponible
      FROM fabricante_materiales
      WHERE fabricante_id = $1
      ORDER BY material;
    `;
    const result = await pool.query(query, [fabricanteId]);
    return result.rows;
  },

  async setMaterialesFabricante(
    fabricanteId: string,
    materiales: string[],
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM fabricante_materiales WHERE fabricante_id = $1",
        [fabricanteId],
      );
      if (materiales.length > 0) {
        const placeholders = materiales
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await client.query(
          `INSERT INTO fabricante_materiales (fabricante_id, material) VALUES ${placeholders}`,
          [fabricanteId, ...materiales],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async getFabricantesCercanos(
    zonaId: number | null,
    provinciaPrefix: string | null,
  ): Promise<any[]> {
    const query = `
      SELECT
        u.id, u.email, u.zona_id, u.puntuacion, u.tagline, u.descripcion, u.experiencia,
        COALESCE(
          json_agg(
            json_build_object('id', fm.id, 'material', fm.material, 'disponible', fm.disponible)
          ) FILTER (WHERE fm.id IS NOT NULL),
          '[]'::json
        ) AS materiales
      FROM usuarios u
      LEFT JOIN fabricante_materiales fm ON fm.fabricante_id = u.id
      WHERE u.rol_principal = 'fabricante'
      GROUP BY u.id
      ORDER BY
        CASE
          WHEN $1::int IS NOT NULL AND u.zona_id = $1 THEN 0
          WHEN $2::text IS NOT NULL AND u.zona_id IS NOT NULL AND (
            CASE
              WHEN length(u.zona_id::text) IN (8, 5) THEN substring(u.zona_id::text, 1, 2)
              WHEN length(u.zona_id::text) IN (7, 4) THEN '0' || substring(u.zona_id::text, 1, 1)
            END
          ) = $2::text THEN 1
          ELSE 2
        END,
        u.puntuacion DESC;
    `;
    const result = await pool.query(query, [zonaId, provinciaPrefix]);
    return result.rows;
  },

  async updateRol(userId: string, rol: string): Promise<any> {
    const query = `
      UPDATE usuarios
      SET rol_principal = $2, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, rol_principal;
    `;
    const result = await pool.query(query, [userId, rol]);
    return result.rows[0] || null;
  },

  async clearFabricanteRows(userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM fabricante_materiales WHERE fabricante_id = $1",
        [userId],
      );
      await client.query(
        "DELETE FROM fabricante_tecnologias WHERE fabricante_id = $1",
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async getTecnologiasFabricante(fabricanteId: string): Promise<Tecnologia[]> {
    const query = `
      SELECT id, tecnologia, disponible
      FROM fabricante_tecnologias
      WHERE fabricante_id = $1
      ORDER BY tecnologia;
    `;
    const result = await pool.query(query, [fabricanteId]);
    return result.rows;
  },

  async setTecnologiasFabricante(
    fabricanteId: string,
    tecnologias: string[],
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM fabricante_tecnologias WHERE fabricante_id = $1",
        [fabricanteId],
      );
      if (tecnologias.length > 0) {
        const placeholders = tecnologias
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await client.query(
          `INSERT INTO fabricante_tecnologias (fabricante_id, tecnologia) VALUES ${placeholders}`,
          [fabricanteId, ...tecnologias],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};
