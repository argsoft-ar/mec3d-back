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
    tipo: "texto" | "sistema" | "propuesta_precio";
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

  async getConversacionesByUsuario(userId: string) {
    const query = `
      SELECT
        c.id, c.orden_fabricacion_id, c.comprador_id, c.fabricante_id, c.creado_en,
        comprador.username AS comprador_username, comprador.tagline AS comprador_tagline,
        fabricante.username AS fabricante_username, fabricante.tagline AS fabricante_tagline,
        o.estado AS orden_estado, o.precio_acordado, o.precio_propuesto_comprador, o.precio_propuesto_fabricante,
        d.titulo AS producto_titulo,
        ultimo.contenido AS ultimo_mensaje_contenido, ultimo.creado_en AS ultimo_mensaje_creado_en
      FROM conversaciones c
      JOIN ordenes_fabricacion o ON o.id = c.orden_fabricacion_id
      JOIN compras cm ON cm.id = o.compra_id
      JOIN disenos d ON d.id = cm.id_modelo
      JOIN usuarios comprador ON comprador.id = c.comprador_id
      JOIN usuarios fabricante ON fabricante.id = c.fabricante_id
      LEFT JOIN LATERAL (
        SELECT contenido, creado_en FROM mensajes m
        WHERE m.conversacion_id = c.id
        ORDER BY creado_en DESC
        LIMIT 1
      ) ultimo ON true
      WHERE c.comprador_id = $1 OR c.fabricante_id = $1
      ORDER BY COALESCE(ultimo.creado_en, c.creado_en) DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  },
};
