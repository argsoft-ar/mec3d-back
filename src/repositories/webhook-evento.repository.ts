import { Db } from "../utils/transaction.util";

export interface NuevoWebhookEvento {
  eventoId: string;
  tipo: string | null;
  accion: string | null;
  dataId: string | null;
  requestId: string | null;
  payload: unknown;
}

export const webhookEventoRepository = {
  // UNIQUE (evento_id): devuelve null si el evento ya fue registrado (duplicado/reintento).
  // Se inserta dentro de la misma transacción que los efectos, así un rollback lo deshace
  // y MP puede reintentar.
  async registrar(db: Db, evento: NuevoWebhookEvento): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO webhook_eventos (evento_id, tipo, accion, data_id, request_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (evento_id) DO NOTHING
       RETURNING id;`,
      [
        evento.eventoId,
        evento.tipo,
        evento.accion,
        evento.dataId,
        evento.requestId,
        JSON.stringify(evento.payload ?? null),
      ],
    );
    return result.rows[0]?.id ?? null;
  },

  async resolver(
    db: Db,
    id: string,
    estado: "procesado" | "ignorado" | "rechazado",
    detalle: string | null,
  ): Promise<void> {
    await db.query(
      `UPDATE webhook_eventos SET estado = $2, detalle = $3 WHERE id = $1;`,
      [id, estado, detalle],
    );
  },

  // MP a veces consulta un pago que todavía no está disponible (404): el evento queda
  // 'reintentable' y se responde 5xx para que MP reintente. evento_id es estable por data.id,
  // así los reintentos (con otro x-request-id) incrementan el mismo contador en vez de
  // quedar como 'duplicado'. Devuelve null si ese contador ya se resolvió (agotado/cerrado).
  async registrarReintento(
    db: Db,
    evento: NuevoWebhookEvento,
  ): Promise<{ id: string; intentos: number } | null> {
    const result = await db.query<{ id: string; intentos: number }>(
      `INSERT INTO webhook_eventos
         (evento_id, tipo, accion, data_id, request_id, estado, detalle, payload, intentos)
       VALUES ($1, $2, $3, $4, $5, 'reintentable', 'pago_no_disponible_en_mp', $6, 1)
       ON CONFLICT (evento_id) DO UPDATE
         SET intentos = webhook_eventos.intentos + 1, request_id = EXCLUDED.request_id
         WHERE webhook_eventos.estado = 'reintentable'
       RETURNING id, intentos;`,
      [
        evento.eventoId,
        evento.tipo,
        evento.accion,
        evento.dataId,
        evento.requestId,
        JSON.stringify(evento.payload ?? null),
      ],
    );
    return result.rows[0] ?? null;
  },

  async agotarReintentos(db: Db, id: string, detalle: string): Promise<void> {
    await db.query(
      `UPDATE webhook_eventos SET estado = 'ignorado', detalle = $2
       WHERE id = $1 AND estado = 'reintentable';`,
      [id, detalle],
    );
  },

  // El pago por fin se pudo procesar: el contador de reintentos de ese data.id ya no aplica.
  async cerrarReintentos(db: Db, eventoId: string): Promise<void> {
    await db.query(
      `UPDATE webhook_eventos SET estado = 'procesado', detalle = 'reintento_resuelto'
       WHERE evento_id = $1 AND estado = 'reintentable';`,
      [eventoId],
    );
  },
};
