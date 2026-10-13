import pool from "../config/db.config";
import type { UploadTipo } from "../interfaces/upload.interface";
import { Db } from "../utils/transaction.util";

export const uploadRepository = {
  // key = clave del objeto en R2 (modelo) o public_id de Cloudinary (imagen); es única.
  async registrar(
    data: { key: string; usuarioId: string; tipo: UploadTipo },
    db: Db = pool,
  ): Promise<void> {
    await db.query(
      `INSERT INTO uploads (key, usuario_id, tipo) VALUES ($1, $2, $3);`,
      [data.key, data.usuarioId, data.tipo],
    );
  },

  // Dueño registrado de la subida, o null si la plataforma no la conoce.
  async getPropietario(key: string, tipo: UploadTipo, db: Db = pool): Promise<string | null> {
    const result = await db.query<{ usuario_id: string }>(
      `SELECT usuario_id FROM uploads WHERE key = $1 AND tipo = $2;`,
      [key, tipo],
    );
    return result.rows[0]?.usuario_id ?? null;
  },
};
