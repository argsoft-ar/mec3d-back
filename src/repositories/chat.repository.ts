import pool from "../config/db.config";
import { Db } from "../utils/transaction.util";
import { MensajeCreadoRow, TipoMensaje } from "../interfaces/chat.interface";

// No leído = posterior a la última lectura (o todos si nunca leyó) y no enviado por el usuario.
// Los mensajes de sistema (remitente_id NULL) cuentan para ambos participantes.
const CONDICION_NO_LEIDO = `
  m.remitente_id IS DISTINCT FROM $1
  AND (l.ultima_lectura_en IS NULL OR m.creado_en > l.ultima_lectura_en)
`;

export const chatRepository = {
  async createConversacion(
    data: {
      ordenFabricacionId: string;
      compradorId: string;
      fabricanteId: string;
    },
    db: Db = pool,
  ) {
    const query = `
      INSERT INTO conversaciones (orden_fabricacion_id, comprador_id, fabricante_id)
      VALUES ($1, $2, $3)
      RETURNING id, orden_fabricacion_id, comprador_id, fabricante_id, creado_en;
    `;
    const result = await db.query(query, [
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

  async getByOrdenFabricacionId(ordenFabricacionId: string, db: Db = pool) {
    const query = `SELECT * FROM conversaciones WHERE orden_fabricacion_id = $1;`;
    const result = await db.query(query, [ordenFabricacionId]);
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

  // Único punto de alta de mensajes: marca la conversación como leída para el remitente y
  // devuelve participantes + username del remitente para notificar sin otra consulta.
  async crearMensaje(
    data: {
      conversacionId: string;
      remitenteId: string | null;
      contenido: string;
      tipo: TipoMensaje;
    },
    db: Db = pool,
  ): Promise<MensajeCreadoRow> {
    const query = `
      WITH nuevo AS (
        INSERT INTO mensajes (conversacion_id, remitente_id, contenido, tipo)
        VALUES ($1, $2, $3, $4)
        RETURNING id, conversacion_id, remitente_id, contenido, tipo, creado_en
      ), lectura AS (
        INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultima_lectura_en)
        SELECT conversacion_id, remitente_id, now() FROM nuevo WHERE remitente_id IS NOT NULL
        ON CONFLICT (conversacion_id, usuario_id) DO UPDATE
          SET ultima_lectura_en = GREATEST(conversacion_lecturas.ultima_lectura_en, EXCLUDED.ultima_lectura_en)
      )
      SELECT n.id, n.conversacion_id, n.remitente_id, n.contenido, n.tipo, n.creado_en,
             c.comprador_id, c.fabricante_id, u.username AS remitente_username
      FROM nuevo n
      JOIN conversaciones c ON c.id = n.conversacion_id
      LEFT JOIN usuarios u ON u.id = n.remitente_id;
    `;
    const result = await db.query(query, [
      data.conversacionId,
      data.remitenteId,
      data.contenido,
      data.tipo,
    ]);
    return result.rows[0];
  },

  async marcarLeida(
    conversacionId: string,
    userId: string,
    db: Db = pool,
  ): Promise<void> {
    const query = `
      INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultima_lectura_en)
      VALUES ($1, $2, now())
      ON CONFLICT (conversacion_id, usuario_id) DO UPDATE
        SET ultima_lectura_en = GREATEST(conversacion_lecturas.ultima_lectura_en, EXCLUDED.ultima_lectura_en);
    `;
    await db.query(query, [conversacionId, userId]);
  },

  async contarNoLeidosTotal(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*)::int AS total
      FROM conversaciones c
      JOIN mensajes m ON m.conversacion_id = c.id
      LEFT JOIN conversacion_lecturas l
        ON l.conversacion_id = c.id AND l.usuario_id = $1
      WHERE (c.comprador_id = $1 OR c.fabricante_id = $1)
        AND ${CONDICION_NO_LEIDO};
    `;
    const result = await pool.query(query, [userId]);
    return Number(result.rows[0]?.total ?? 0);
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
        ultimo.contenido AS ultimo_mensaje_contenido, ultimo.creado_en AS ultimo_mensaje_creado_en,
        no_leidos.total AS no_leidos
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
      LEFT JOIN conversacion_lecturas l
        ON l.conversacion_id = c.id AND l.usuario_id = $1
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total FROM mensajes m
        WHERE m.conversacion_id = c.id AND ${CONDICION_NO_LEIDO}
      ) no_leidos ON true
      WHERE c.comprador_id = $1 OR c.fabricante_id = $1
      ORDER BY COALESCE(ultimo.creado_en, c.creado_en) DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  },
};
