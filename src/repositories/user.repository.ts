import pool from "../config/db.config";
import {
  Material,
  Tecnologia,
  UpdateProfileDTO,
} from "../interfaces/user.interface";
import { Db } from "../utils/transaction.util";

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
    username: string;
    passwordHash: string;
    rolPrincipal: string;
    zonaId?: number;
    georefLocalidadId?: string;
  }) {
    const query = `
      INSERT INTO usuarios (email, username, password_hash, rol_principal, zona_id, georef_localidad_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, username, rol_principal, zona_id, creado_en;
    `;

    const values = [
      userData.email,
      userData.username,
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
             cuenta_mercadopago_actualizada_en,
             tagline, descripcion, experiencia, creado_en, actualizado_en,
             georef_localidad_id, username, telefono, direccion
      FROM usuarios
      WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  },

  // Cuenta destino de payouts. FOR SHARE: un cambio de cuenta concurrente espera a que termine
  // la transacción que registra el pago (la cuenta que se valida es la que se audita).
  async getCuentaPayout(
    db: Db,
    userId: string,
  ): Promise<{
    cuenta_mercadopago: string | null;
    cuenta_mercadopago_actualizada_en: string | null;
  } | null> {
    const result = await db.query(
      `SELECT cuenta_mercadopago, cuenta_mercadopago_actualizada_en
       FROM usuarios WHERE id = $1 FOR SHARE;`,
      [userId],
    );
    return result.rows[0] ?? null;
  },

  // Subconjunto de ids que corresponde a usuarios con rol fabricante (una sola query).
  async findFabricanteIds(ids: string[]): Promise<string[]> {
    const result = await pool.query<{ id: string }>(
      `SELECT id FROM usuarios WHERE id = ANY($1::uuid[]) AND rol_principal = 'fabricante';`,
      [ids],
    );
    return result.rows.map((r) => r.id);
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
      // El cooldown de payouts arranca solo si la cuenta realmente cambia (los SET leen la fila vieja).
      fields.push(
        `cuenta_mercadopago_actualizada_en = CASE WHEN cuenta_mercadopago IS DISTINCT FROM $${idx}::varchar THEN now() ELSE cuenta_mercadopago_actualizada_en END`,
      );
      fields.push(`cuenta_mercadopago = $${idx}::varchar`);
      idx++;
      values.push(
        data.cuentaMercadopago === "" ? null : data.cuentaMercadopago,
      );
    }
    if (data.georefLocalidadId !== undefined) {
      fields.push(`georef_localidad_id = $${idx++}`);
      values.push(data.georefLocalidadId);
    }
    if (data.username !== undefined) {
      fields.push(`username = $${idx++}`);
      values.push(data.username);
    }
    if (data.telefono !== undefined) {
      fields.push(`telefono = $${idx++}`);
      values.push(data.telefono);
    }
    if (data.direccion !== undefined) {
      fields.push(`direccion = $${idx++}`);
      values.push(data.direccion);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`actualizado_en = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE usuarios
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, email, rol_principal, zona_id, puntuacion, cuenta_mercadopago,
                cuenta_mercadopago_actualizada_en,
                tagline, descripcion, experiencia, actualizado_en, georef_localidad_id,
                username, telefono, direccion;
    `;
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  },

  async isUsernameTaken(
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const query = excludeUserId
      ? `SELECT 1 FROM usuarios WHERE lower(username) = $1 AND id != $2 LIMIT 1;`
      : `SELECT 1 FROM usuarios WHERE lower(username) = $1 LIMIT 1;`;
    const values = excludeUserId ? [username, excludeUserId] : [username];
    const result = await pool.query(query, values);
    return (result.rowCount ?? 0) > 0;
  },

  async getMaterialesFabricante(fabricanteId: string): Promise<Material[]> {
    // Inner join: los textos históricos sin match en el catálogo (material_id NULL) no se exponen.
    const query = `
      SELECT fm.id, m.nombre AS material, fm.material_id AS "materialId",
             t.nombre AS tecnologia, fm.disponible
      FROM fabricante_materiales fm
      JOIN materiales m ON m.id = fm.material_id
      JOIN tecnologias t ON t.id = m.tecnologia_id
      WHERE fm.fabricante_id = $1
      ORDER BY m.nombre;
    `;
    const result = await pool.query(query, [fabricanteId]);
    return result.rows;
  },

  async setMaterialesFabricante(
    fabricanteId: string,
    materiales: { id: number; nombre: string }[],
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
          .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
          .join(", ");
        await client.query(
          `INSERT INTO fabricante_materiales (fabricante_id, material, material_id) VALUES ${placeholders}`,
          [fabricanteId, ...materiales.flatMap((m) => [m.nombre, m.id])],
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
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const query = `
      SELECT
        u.id, u.zona_id, u.puntuacion, u.tagline, u.descripcion, u.experiencia,
        COALESCE(
          json_agg(
            json_build_object('id', fm.id, 'material', m.nombre, 'materialId', fm.material_id, 'disponible', fm.disponible)
          ) FILTER (WHERE fm.id IS NOT NULL),
          '[]'::json
        ) AS materiales
      FROM usuarios u
      LEFT JOIN fabricante_materiales fm ON fm.fabricante_id = u.id AND fm.material_id IS NOT NULL
      LEFT JOIN materiales m ON m.id = fm.material_id
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
        u.puntuacion DESC, u.id
      LIMIT $3 OFFSET $4;
    `;
    const result = await pool.query(query, [
      zonaId,
      provinciaPrefix,
      limit,
      offset,
    ]);
    return result.rows;
  },

  async updateRol(userId: string, rol: string, db: Db = pool): Promise<any> {
    const query = `
      UPDATE usuarios
      SET rol_principal = $2, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, rol_principal;
    `;
    const result = await db.query(query, [userId, rol]);
    return result.rows[0] || null;
  },

  // Bloquea la fila del usuario para serializar cambios de rol concurrentes.
  async lockRolById(
    db: Db,
    userId: string,
  ): Promise<{ rol_principal: string } | null> {
    const result = await db.query<{ rol_principal: string }>(
      `SELECT rol_principal FROM usuarios WHERE id = $1 FOR UPDATE;`,
      [userId],
    );
    return result.rows[0] ?? null;
  },

  // Órdenes de fabricación en curso (como comprador o como fabricante).
  async tieneOrdenesActivas(db: Db, userId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1
       FROM ordenes_fabricacion o
       JOIN compras c ON c.id = o.compra_id
       WHERE (o.fabricante_id = $1 OR c.id_comprador = $1)
         AND o.estado IN ('solicitado', 'en_negociacion', 'trato_cerrado', 'confirmada', 'en_disputa')
       LIMIT 1;`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  // Fondos del usuario que todavía no se liquidaron (retenidos o con payout pendiente).
  async tieneMovimientosPendientes(db: Db, userId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM movimientos
       WHERE usuario_id = $1 AND estado IN ('retenido', 'pendiente_payout')
       LIMIT 1;`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async clearFabricanteRows(db: Db, userId: string): Promise<void> {
    await db.query(
      "DELETE FROM fabricante_materiales WHERE fabricante_id = $1",
      [userId],
    );
    await db.query(
      "DELETE FROM fabricante_tecnologias WHERE fabricante_id = $1",
      [userId],
    );
  },

  async getTecnologiasFabricante(fabricanteId: string): Promise<Tecnologia[]> {
    const query = `
      SELECT ft.id, t.nombre AS tecnologia, ft.tecnologia_id AS "tecnologiaId",
             ft.disponible
      FROM fabricante_tecnologias ft
      JOIN tecnologias t ON t.id = ft.tecnologia_id
      WHERE ft.fabricante_id = $1
      ORDER BY t.nombre;
    `;
    const result = await pool.query(query, [fabricanteId]);
    return result.rows;
  },

  async setTecnologiasFabricante(
    fabricanteId: string,
    tecnologias: { id: number; nombre: string }[],
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
          .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
          .join(", ");
        await client.query(
          `INSERT INTO fabricante_tecnologias (fabricante_id, tecnologia, tecnologia_id) VALUES ${placeholders}`,
          [fabricanteId, ...tecnologias.flatMap((t) => [t.nombre, t.id])],
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
