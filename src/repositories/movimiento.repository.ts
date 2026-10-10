import pool from "../config/db.config";
import {
  EstadoMovimiento,
  MovimientoRow,
  TipoMovimiento,
} from "../interfaces/pago.interface";
import { toCentavos } from "../utils/money.util";
import { Db } from "../utils/transaction.util";

const COLUMNAS = `id, pago_id, compra_id, orden_id, usuario_id, tipo, monto_centavos,
  estado, payout_referencia, payout_destino, payout_admin_id, liberado_en, liberable_desde,
  pagado_en, creado_en`;

const TIPOS_DESGLOSE: TipoMovimiento[] = [
  "comision_plataforma",
  "regalia_disenador",
  "pago_fabricante",
  "pago_disenador",
];

export interface NuevoMovimiento {
  pagoId: string;
  compraId: string;
  ordenId: string | null;
  usuarioId: string | null;
  tipo: TipoMovimiento;
  montoCentavos: number;
  estado: EstadoMovimiento;
}

export const movimientoRepository = {
  // UNIQUE (pago_id, tipo): reintentar la escritura del ledger no duplica movimientos.
  async insertar(db: Db, mov: NuevoMovimiento): Promise<boolean> {
    const result = await db.query(
      `INSERT INTO movimientos (pago_id, compra_id, orden_id, usuario_id, tipo, monto_centavos, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pago_id, tipo) DO NOTHING;`,
      [
        mov.pagoId,
        mov.compraId,
        mov.ordenId,
        mov.usuarioId,
        mov.tipo,
        mov.montoCentavos,
        mov.estado,
      ],
    );
    return result.rowCount === 1;
  },

  async existeRetencion(db: Db, pagoId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM movimientos WHERE pago_id = $1 AND tipo = 'retencion';`,
      [pagoId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  // Suma del desglose (sin la retención ni el reembolso): debe igualar el monto del pago.
  async sumaDesglose(db: Db, pagoId: string): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(monto_centavos), 0) AS total FROM movimientos
       WHERE pago_id = $1 AND tipo = ANY($2::text[]);`,
      [pagoId, TIPOS_DESGLOSE],
    );
    return toCentavos(result.rows[0].total);
  },

  // retenido -> liberado (plataforma/retención) | pendiente_payout (vendedores). holdDias > 0
  // difiere cuándo el payout puede pagarse (liberable_desde); 0 = pagable de inmediato.
  async liberarPorPago(
    db: Db,
    pagoId: string,
    holdDias = 0,
  ): Promise<MovimientoRow[]> {
    const result = await db.query<MovimientoRow>(
      `UPDATE movimientos
       SET estado = CASE WHEN usuario_id IS NULL THEN 'liberado' ELSE 'pendiente_payout' END,
           liberado_en = now(), liberable_desde = now() + make_interval(days => $2),
           actualizado_en = now()
       WHERE pago_id = $1 AND estado = 'retenido'
       RETURNING ${COLUMNAS};`,
      [pagoId, holdDias],
    );
    return result.rows;
  },

  // Devuelve cuántos movimientos se revirtieron y cuántos ya estaban pagados (irreversibles).
  async reembolsarPorPago(
    db: Db,
    pagoId: string,
  ): Promise<{ revertidos: number; yaPagados: number }> {
    const result = await db.query(
      `UPDATE movimientos
       SET estado = 'reembolsado', actualizado_en = now()
       WHERE pago_id = $1 AND tipo <> 'reembolso'
         AND estado IN ('retenido', 'liberado', 'pendiente_payout');`,
      [pagoId],
    );
    const pagados = await db.query(
      `SELECT 1 FROM movimientos WHERE pago_id = $1 AND estado = 'pagado';`,
      [pagoId],
    );
    return {
      revertidos: result.rowCount ?? 0,
      yaPagados: pagados.rowCount ?? 0,
    };
  },

  async insertarReembolso(
    db: Db,
    data: {
      pagoId: string;
      compraId: string;
      ordenId: string | null;
      compradorId: string;
      montoCentavos: number;
    },
  ): Promise<boolean> {
    return this.insertar(db, {
      pagoId: data.pagoId,
      compraId: data.compraId,
      ordenId: data.ordenId,
      usuarioId: data.compradorId,
      tipo: "reembolso",
      montoCentavos: data.montoCentavos,
      estado: "reembolsado",
    });
  },

  // ── Billetera ────────────────────────────────────────────────────────────
  async listarPorUsuario(
    usuarioId: string,
    estados: EstadoMovimiento[],
    limit: number,
    offset: number,
  ): Promise<{ rows: MovimientoRow[]; total: number }> {
    const [rows, total] = await Promise.all([
      pool.query<MovimientoRow>(
        `SELECT ${COLUMNAS} FROM movimientos
         WHERE usuario_id = $1 AND estado = ANY($2::text[]) AND tipo <> 'reembolso'
         ORDER BY creado_en DESC, id
         LIMIT $3 OFFSET $4;`,
        [usuarioId, estados, limit, offset],
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM movimientos
         WHERE usuario_id = $1 AND estado = ANY($2::text[]) AND tipo <> 'reembolso';`,
        [usuarioId, estados],
      ),
    ]);
    return { rows: rows.rows, total: Number(total.rows[0].total) };
  },

  async sumasPorEstado(
    usuarioId: string,
  ): Promise<Record<"retenido" | "pendiente_payout" | "pagado", number>> {
    const result = await pool.query<{ estado: EstadoMovimiento; total: string }>(
      `SELECT estado, SUM(monto_centavos) AS total FROM movimientos
       WHERE usuario_id = $1 AND tipo <> 'reembolso'
         AND estado IN ('retenido', 'pendiente_payout', 'pagado')
       GROUP BY estado;`,
      [usuarioId],
    );
    const sumas = { retenido: 0, pendiente_payout: 0, pagado: 0 };
    for (const row of result.rows) {
      if (row.estado in sumas) {
        sumas[row.estado as keyof typeof sumas] = toCentavos(row.total);
      }
    }
    return sumas;
  },

  // ── Payouts (admin) ──────────────────────────────────────────────────────
  async listarPayoutsPendientes(limit: number, offset: number) {
    const [rows, total] = await Promise.all([
      pool.query<
        MovimientoRow & {
          email: string;
          cuenta_mercadopago: string | null;
          cuenta_mercadopago_actualizada_en: string | null;
        }
      >(
        `SELECT m.id, m.pago_id, m.compra_id, m.orden_id, m.usuario_id, m.tipo,
                m.monto_centavos, m.estado, m.payout_referencia, m.payout_destino,
                m.payout_admin_id, m.liberado_en, m.liberable_desde, m.pagado_en, m.creado_en,
                u.email, u.cuenta_mercadopago, u.cuenta_mercadopago_actualizada_en
         FROM movimientos m
         JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.estado = 'pendiente_payout'
         ORDER BY m.liberado_en ASC, m.id
         LIMIT $1 OFFSET $2;`,
        [limit, offset],
      ),
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM movimientos WHERE estado = 'pendiente_payout';`,
      ),
    ]);
    return { rows: rows.rows, total: Number(total.rows[0].total) };
  },

  async lockPayoutPendiente(
    db: Db,
    id: string,
  ): Promise<MovimientoRow | null> {
    const result = await db.query<MovimientoRow>(
      `SELECT ${COLUMNAS} FROM movimientos
       WHERE id = $1 AND estado = 'pendiente_payout' AND usuario_id IS NOT NULL
       FOR UPDATE;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  // Cualquier estado: permite distinguir inexistente / ya pagado / no pagable.
  async lockPorId(db: Db, id: string): Promise<MovimientoRow | null> {
    const result = await db.query<MovimientoRow>(
      `SELECT ${COLUMNAS} FROM movimientos WHERE id = $1 FOR UPDATE;`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  // Solo prospera fuera del período de retención; deja registrada la cuenta destino y el admin.
  async marcarPagado(
    db: Db,
    id: string,
    referencia: string,
    auditoria: { destino: string; adminId: string | null },
  ): Promise<MovimientoRow | null> {
    const result = await db.query<MovimientoRow>(
      `UPDATE movimientos
       SET estado = 'pagado', pagado_en = now(), payout_referencia = $2,
           payout_destino = $3, payout_admin_id = $4, actualizado_en = now()
       WHERE id = $1 AND estado = 'pendiente_payout'
         AND (liberable_desde IS NULL OR liberable_desde <= now())
       RETURNING ${COLUMNAS};`,
      [id, referencia, auditoria.destino, auditoria.adminId],
    );
    return result.rows[0] ?? null;
  },
};
