import pool from "../config/db.config";
import { Db } from "../utils/transaction.util";
import {
  ConversacionConOrdenRow,
  ConversacionRow,
  MensajeCreadoRow,
  RolConversacion,
  TipoMensaje,
} from "../interfaces/chat.interface";

// No leído = posterior a la última lectura (o todos si nunca leyó) y no enviado por el usuario.
// Los mensajes de sistema (remitente_id NULL) cuentan para ambos participantes.
const CONDICION_NO_LEIDO = `
  m.remitente_id IS DISTINCT FROM $1
  AND (l.ultima_lectura_en IS NULL OR m.creado_en > l.ultima_lectura_en)
`;

// El cierre es por participante: la conversación desaparece solo para quien la cerró.
const VISIBLE_PARA_USUARIO = `
  ((c.comprador_id = $1 AND c.cerrada_por_comprador_en IS NULL)
    OR (c.fabricante_id = $1 AND c.cerrada_por_fabricante_en IS NULL))
`;

// Whitelist de columnas: el rol nunca se interpola sin pasar por acá.
const COLUMNA_CIERRE: Record<RolConversacion, string> = {
  comprador: "cerrada_por_comprador_en",
  fabricante: "cerrada_por_fabricante_en",
};

// Estados de orden cuya conversación ya no admite mensajes de usuario (literales fijos).
const ESTADOS_ORDEN_SIN_MENSAJES = `'cancelado', 'rechazado'`;

// Marca la conversación como leída para el remitente del mensaje recién insertado (CTE "nuevo").
const CTE_LECTURA_REMITENTE = `lectura AS (
        INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultima_lectura_en)
        SELECT conversacion_id, remitente_id, now() FROM nuevo WHERE remitente_id IS NOT NULL
        ON CONFLICT (conversacion_id, usuario_id) DO UPDATE
          SET ultima_lectura_en = GREATEST(conversacion_lecturas.ultima_lectura_en, EXCLUDED.ultima_lectura_en)
      )`;

// Forma de MensajeCreadoRow: incluye el estado de cierre para que el notificador omita a
// quien cerró la conversación.
const COLUMNAS_MENSAJE_CREADO = `n.id, n.conversacion_id, n.remitente_id, n.contenido, n.tipo, n.creado_en,
             c.comprador_id, c.fabricante_id,
             c.cerrada_por_comprador_en, c.cerrada_por_fabricante_en,
             u.username AS remitente_username`;

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

  // Conversación + estado de la orden: base de los chequeos de acceso del socket
  // (unirse a la room / enviar mensajes). Nunca se confía en la membresía del cliente.
  async getConOrden(
    conversacionId: string,
  ): Promise<ConversacionConOrdenRow | null> {
    const query = `
      SELECT c.id, c.orden_fabricacion_id, c.comprador_id, c.fabricante_id, c.creado_en,
             c.cerrada_por_comprador_en, c.cerrada_por_fabricante_en,
             o.estado AS orden_estado
      FROM conversaciones c
      JOIN ordenes_fabricacion o ON o.id = c.orden_fabricacion_id
      WHERE c.id = $1;
    `;
    const result = await pool.query<ConversacionConOrdenRow>(query, [
      conversacionId,
    ]);
    return result.rows[0] ?? null;
  },

  // Idempotente: COALESCE conserva la fecha del primer cierre.
  async cerrarParaUsuario(
    db: Db,
    conversacionId: string,
    rol: RolConversacion,
  ): Promise<ConversacionRow | null> {
    const columna = COLUMNA_CIERRE[rol];
    const query = `
      UPDATE conversaciones
      SET ${columna} = COALESCE(${columna}, now())
      WHERE id = $1
      RETURNING id, orden_fabricacion_id, comprador_id, fabricante_id, creado_en,
                cerrada_por_comprador_en, cerrada_por_fabricante_en;
    `;
    const result = await db.query<ConversacionRow>(query, [conversacionId]);
    return result.rows[0] ?? null;
  },

  // Lock de la conversación dentro de una transacción (último eslabón de la jerarquía
  // compra -> orden -> conversación). Serializa el cierre con los envíos (FOR SHARE).
  async lockById(db: Db, id: string): Promise<ConversacionRow | null> {
    const query = `
      SELECT id, orden_fabricacion_id, comprador_id, fabricante_id, creado_en,
             cerrada_por_comprador_en, cerrada_por_fabricante_en
      FROM conversaciones
      WHERE id = $1
      FOR UPDATE;
    `;
    const result = await db.query<ConversacionRow>(query, [id]);
    return result.rows[0] ?? null;
  },

  // Alta de mensajes sin guard (sistema / flujos que ya validaron con locks): marca la
  // conversación como leída para el remitente y devuelve participantes, estado de cierre y
  // username del remitente para notificar sin otra consulta.
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
      ), ${CTE_LECTURA_REMITENTE}
      SELECT ${COLUMNAS_MENSAJE_CREADO}
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

  // Alta guardada de mensajes de usuario (CWE-367): en una sola sentencia inserta solo si el
  // remitente participa, ninguna parte cerró la conversación y la orden no está
  // cancelada/rechazada. FOR SHARE OF c serializa con el cierre (que toma FOR UPDATE de la
  // conversación): si el cierre llegó antes, la fila se re-evalúa ya cerrada y no se inserta.
  // Solo se bloquea la conversación (no la orden) para no invertir el orden orden -> conversación.
  // Devuelve null si no se insertó nada.
  async crearMensajeSiAbierta(
    data: {
      conversacionId: string;
      remitenteId: string;
      contenido: string;
      tipo: Exclude<TipoMensaje, "sistema">;
    },
    db: Db = pool,
  ): Promise<MensajeCreadoRow | null> {
    const query = `
      WITH conv AS (
        SELECT c.id, c.comprador_id, c.fabricante_id,
               c.cerrada_por_comprador_en, c.cerrada_por_fabricante_en
        FROM conversaciones c
        JOIN ordenes_fabricacion o ON o.id = c.orden_fabricacion_id
        WHERE c.id = $1
          AND $2::uuid IN (c.comprador_id, c.fabricante_id)
          AND c.cerrada_por_comprador_en IS NULL
          AND c.cerrada_por_fabricante_en IS NULL
          AND o.estado NOT IN (${ESTADOS_ORDEN_SIN_MENSAJES})
        FOR SHARE OF c
      ), nuevo AS (
        INSERT INTO mensajes (conversacion_id, remitente_id, contenido, tipo)
        SELECT conv.id, $2::uuid, $3::text, $4::varchar FROM conv
        RETURNING id, conversacion_id, remitente_id, contenido, tipo, creado_en
      ), ${CTE_LECTURA_REMITENTE}
      SELECT ${COLUMNAS_MENSAJE_CREADO}
      FROM nuevo n
      JOIN conv c ON c.id = n.conversacion_id
      LEFT JOIN usuarios u ON u.id = n.remitente_id;
    `;
    const result = await db.query<MensajeCreadoRow>(query, [
      data.conversacionId,
      data.remitenteId,
      data.contenido,
      data.tipo,
    ]);
    return result.rows[0] ?? null;
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
      WHERE ${VISIBLE_PARA_USUARIO}
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
        c.cerrada_por_comprador_en, c.cerrada_por_fabricante_en,
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
      WHERE ${VISIBLE_PARA_USUARIO}
      ORDER BY COALESCE(ultimo.creado_en, c.creado_en) DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  },
};
