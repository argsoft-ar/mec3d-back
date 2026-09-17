import pool from "../config/db.config";

export const chatRepository = {
  async createConversacion(data: {
    ordenFabricacionId: string;
    compradorId: string;
    fabricanteId: string;
  }) {
    const query = `
      INSERT INTO conversaciones (orden_fabricacion_id, comprador_id, fabricante_id)
      VALUES ($1, $2, $3)
      RETURNING id, orden_fabricacion_id, comprador_id, fabricante_id, creado_en;
    `;
    const result = await pool.query(query, [
      data.ordenFabricacionId,
      data.compradorId,
      data.fabricanteId,
    ]);
    return result.rows[0];
  },

  async getById(id: string) {
    const query = `SELECT * FROM conversaciones WHERE id = $1;`;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  },

  async getByOrdenFabricacionId(ordenFabricacionId: string) {
    const query = `SELECT * FROM conversaciones WHERE orden_fabricacion_id = $1;`;
    const result = await pool.query(query, [ordenFabricacionId]);
    return result.rows[0] ?? null;
  },

  // Boundary de autorización para el socket: se verifica pertenencia contra la
  // base antes de dejar a un usuario unirse a la room de una conversación.
  async esParticipante(
    conversacionId: string,
    userId: string,
  ): Promise<boolean> {
    const query = `
      SELECT 1 FROM conversaciones
      WHERE id = $1 AND (comprador_id = $2 OR fabricante_id = $2)
      LIMIT 1;
    `;
    const result = await pool.query(query, [conversacionId, userId]);
    return (result.rowCount ?? 0) > 0;
  },

  async crearMensaje(data: {
    conversacionId: string;
    remitenteId: string | null;
    contenido: string;
    tipo: "texto" | "sistema";
  }) {
    const query = `
      INSERT INTO mensajes (conversacion_id, remitente_id, contenido, tipo)
      VALUES ($1, $2, $3, $4)
      RETURNING id, conversacion_id, remitente_id, contenido, tipo, creado_en;
    `;
    const result = await pool.query(query, [
      data.conversacionId,
      data.remitenteId,
      data.contenido,
      data.tipo,
    ]);
    return result.rows[0];
  },

  async getMensajesPaginated(
    conversacionId: string,
    limit: number,
    offset: number,
  ) {
    const countQuery = `SELECT COUNT(*) FROM mensajes WHERE conversacion_id = $1;`;
    const countResult = await pool.query(countQuery, [conversacionId]);
    const total = Number.parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT id, conversacion_id, remitente_id, contenido, tipo, creado_en
      FROM mensajes
      WHERE conversacion_id = $1
      ORDER BY creado_en DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await pool.query(query, [conversacionId, limit, offset]);
    return { rows: result.rows, total };
  },
};
