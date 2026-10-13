import pool from "../config/db.config";
import { PagoRow } from "../interfaces/pago.interface";
import { Db } from "../utils/transaction.util";

const COLUMNAS = `id, compra_id, orden_id, mp_payment_id, mp_preference_id, estado,
  monto_centavos, moneda, mp_status, mp_status_detail, reembolso_pendiente,
  motivo_reembolso, mp_refund_id, aprobado_en, reembolsado_en, revision_admin,
  revision_motivo, payouts_pagados_al_reembolsar, creado_en, actualizado_en`;

export interface DatosMpPago {
  mpStatus: string | null;
  mpStatusDetail: string | null;
  raw: Record<string, unknown>;
}

export const pagoRepository = {
  async crearPendiente(
    db: Db,
    data: { compraId: string; ordenId: string | null; montoCentavos: number },
  ): Promise<PagoRow> {
    const result = await db.query<PagoRow>(
      `INSERT INTO pagos (compra_id, orden_id, monto_centavos)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNAS};`,
      [data.compraId, data.ordenId, data.montoCentavos],
    );
    return result.rows[0];
  },

  // Pago ya cobrado en MP que no tenía fila local (otro intento sobre la misma compra).
  async insertarDesdeMp(
    db: Db,
    data: {
      compraId: string;
      ordenId: string | null;
      mpPaymentId: string;
      montoCentavos: number;
      moneda?: string;
    } & DatosMpPago,
  ): Promise<PagoRow> {
    const result = await db.query<PagoRow>(
      `INSERT INTO pagos (compra_id, orden_id, mp_payment_id, monto_centavos, moneda, mp_status, mp_status_detail, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNAS};`,
      [
        data.compraId,
        data.ordenId,
        data.mpPaymentId,
        data.montoCentavos,
        data.moneda ?? "ARS",
        data.mpStatus,
        data.mpStatusDetail,
        JSON.stringify(data.raw),
      ],
    );
    return result.rows[0];
  },

  async setPreference(
    id: string,
    preferenceId: string,
    db: Db = pool,
  ): Promise<void> {
    await db.query(
      `UPDATE pagos SET mp_preference_id = $2, actualizado_en = now() WHERE id = $1;`,
      [id, preferenceId],
    );
  },

  async getById(id: string, db: Db = pool): Promise<PagoRow | null> {
    const result = await db.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos WHERE id = $1;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async lockById(db: Db, id: string): Promise<PagoRow | null> {
    const result = await db.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos WHERE id = $1 FOR UPDATE;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async lockByMpPaymentId(
    db: Db,
    mpPaymentId: string,
  ): Promise<PagoRow | null> {
    const result = await db.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos WHERE mp_payment_id = $1 FOR UPDATE;`,
      [mpPaymentId],
    );
    return result.rows[0] ?? null;
  },

  async getUltimoPorCompra(
    compraId: string,
    db: Db = pool,
  ): Promise<PagoRow | null> {
    const result = await db.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos WHERE compra_id = $1
       ORDER BY creado_en DESC LIMIT 1;`,
      [compraId],
    );
    return result.rows[0] ?? null;
  },

  // Pago que respalda el ledger de la compra (a lo sumo uno: el resto son duplicados reembolsables).
  async lockAprobadoPrincipalPorCompra(
    db: Db,
    compraId: string,
  ): Promise<PagoRow | null> {
    const result = await db.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos p
       WHERE p.compra_id = $1 AND p.estado = 'aprobado'
         AND EXISTS (SELECT 1 FROM movimientos m WHERE m.pago_id = p.id AND m.tipo = 'retencion')
       ORDER BY p.aprobado_en ASC
       LIMIT 1
       FOR UPDATE OF p;`,
      [compraId],
    );
    return result.rows[0] ?? null;
  },

  // Vincula el id de MP a un pago local todavía sin asignar.
  async asignarMpPayment(
    db: Db,
    id: string,
    mpPaymentId: string,
    datos: DatosMpPago,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET mp_payment_id = $2, mp_status = $3, mp_status_detail = $4, raw = $5, actualizado_en = now()
       WHERE id = $1 AND mp_payment_id IS NULL;`,
      [
        id,
        mpPaymentId,
        datos.mpStatus,
        datos.mpStatusDetail,
        JSON.stringify(datos.raw),
      ],
    );
    return result.rowCount === 1;
  },

  async actualizarMpStatus(
    db: Db,
    id: string,
    datos: DatosMpPago,
  ): Promise<void> {
    await db.query(
      `UPDATE pagos
       SET mp_status = $2, mp_status_detail = $3, raw = $4, actualizado_en = now()
       WHERE id = $1;`,
      [id, datos.mpStatus, datos.mpStatusDetail, JSON.stringify(datos.raw)],
    );
  },

  async marcarAprobado(
    db: Db,
    id: string,
    datos: DatosMpPago,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET estado = 'aprobado', aprobado_en = now(), mp_status = $2, mp_status_detail = $3,
           raw = $4, actualizado_en = now()
       WHERE id = $1 AND estado IN ('pendiente', 'rechazado');`,
      [id, datos.mpStatus, datos.mpStatusDetail, JSON.stringify(datos.raw)],
    );
    return result.rowCount === 1;
  },

  async marcarRechazado(
    db: Db,
    id: string,
    datos: DatosMpPago,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET estado = 'rechazado', mp_status = $2, mp_status_detail = $3,
           raw = $4, actualizado_en = now()
       WHERE id = $1 AND estado = 'pendiente';`,
      [id, datos.mpStatus, datos.mpStatusDetail, JSON.stringify(datos.raw)],
    );
    return result.rowCount === 1;
  },

  async marcarReembolsoPendiente(
    db: Db,
    id: string,
    motivo: string,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET reembolso_pendiente = true, motivo_reembolso = COALESCE(motivo_reembolso, $2),
           actualizado_en = now()
       WHERE id = $1 AND estado = 'aprobado';`,
      [id, motivo],
    );
    return result.rowCount === 1;
  },

  async marcarReembolsado(
    db: Db,
    id: string,
    refundId: string | null,
    mpStatus: string | null,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET estado = 'reembolsado', reembolso_pendiente = false, reembolsado_en = now(),
           mp_refund_id = COALESCE($2, mp_refund_id), mp_status = COALESCE($3, mp_status),
           actualizado_en = now()
       WHERE id = $1 AND estado = 'aprobado';`,
      [id, refundId, mpStatus],
    );
    return result.rowCount === 1;
  },

  async listarReembolsosPendientes(limit: number): Promise<PagoRow[]> {
    const result = await pool.query<PagoRow>(
      `SELECT ${COLUMNAS} FROM pagos
       WHERE reembolso_pendiente AND estado = 'aprobado'
       ORDER BY creado_en ASC
       LIMIT $1;`,
      [limit],
    );
    return result.rows;
  },

  // Reembolso de un pago que MP devolvió antes de que llegara a aprobarse localmente
  // (notificaciones fuera de orden): no hubo retención, así que no hay nada que revertir.
  async marcarReembolsadoSinAprobar(
    db: Db,
    id: string,
    motivo: string,
    mpStatus: string | null,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE pagos
       SET estado = 'reembolsado', reembolso_pendiente = false, reembolsado_en = now(),
           motivo_reembolso = COALESCE(motivo_reembolso, $2), mp_status = COALESCE($3, mp_status),
           actualizado_en = now()
       WHERE id = $1 AND estado IN ('pendiente', 'rechazado');`,
      [id, motivo, mpStatus],
    );
    return result.rowCount === 1;
  },

  // Marca el pago para revisión de un admin (refund parcial en MP, payouts ya pagados, etc.).
  async marcarRevisionAdmin(
    db: Db,
    id: string,
    motivo: string,
    payoutsPagados = 0,
  ): Promise<void> {
    await db.query(
      `UPDATE pagos
       SET revision_admin = true, revision_motivo = $2,
           payouts_pagados_al_reembolsar = GREATEST(payouts_pagados_al_reembolsar, $3),
           actualizado_en = now()
       WHERE id = $1;`,
      [id, motivo, payoutsPagados],
    );
  },

  async listarEnRevision(
    limit: number,
    offset: number,
  ): Promise<{ rows: PagoRow[]; total: number }> {
    const [rows, total] = await Promise.all([
      pool.query<PagoRow>(
        `SELECT ${COLUMNAS} FROM pagos WHERE revision_admin
         ORDER BY creado_en ASC, id LIMIT $1 OFFSET $2;`,
        [limit, offset],
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM pagos WHERE revision_admin;`,
      ),
    ]);
    return { rows: rows.rows, total: Number(total.rows[0].total) };
  },

  // Compras 'pendiente_pago' con un intento de pago reciente que ya tuvo tiempo de acreditarse
  // (más nuevas primero): candidatas a reconciliar contra MP por si se perdió el webhook.
  async listarComprasParaReconciliar(
    limit: number,
    ventanaDias = 3,
    minimoMinutos = 2,
  ): Promise<string[]> {
    const result = await pool.query<{ compra_id: string }>(
      `SELECT c.id AS compra_id
       FROM compras c
       JOIN pagos p ON p.compra_id = c.id
       WHERE c.estado = 'pendiente_pago'
         AND p.mp_preference_id IS NOT NULL
         AND p.creado_en > now() - make_interval(days => $2)
         AND p.creado_en < now() - make_interval(mins => $3)
       GROUP BY c.id
       ORDER BY MAX(p.creado_en) DESC
       LIMIT $1;`,
      [limit, ventanaDias, minimoMinutos],
    );
    return result.rows.map((r) => r.compra_id);
  },
};
