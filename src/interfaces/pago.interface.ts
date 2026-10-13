// ── Estados ────────────────────────────────────────────────────────────────
export type TipoCompra = "descarga" | "fabricacion";
export type EstadoCompra =
  | "pendiente_pago"
  | "pagada"
  | "completada"
  | "reembolsada"
  | "cancelada";
export type EstadoPago = "pendiente" | "aprobado" | "rechazado" | "reembolsado";
export type TipoMovimiento =
  | "retencion"
  | "comision_plataforma"
  | "regalia_disenador"
  | "pago_fabricante"
  | "pago_disenador"
  | "reembolso";
export type EstadoMovimiento =
  | "retenido"
  | "liberado"
  | "pendiente_payout"
  | "pagado"
  | "reembolsado";

// ── Filas de DB (pg devuelve BIGINT como string) ───────────────────────────
export interface CompraRow {
  id: string;
  id_comprador: string;
  id_modelo: string;
  id_disenador: string;
  material_id: number | null;
  tipo: TipoCompra;
  estado: EstadoCompra;
  monto_centavos: string | null;
  moneda: string;
  fecha: string;
  pagada_en: string | null;
  cancelada_en: string | null;
  entrega_confirmada: boolean;
  entregado_en: string | null;
  fondos_liberados: boolean;
  fondos_liberados_en: string | null;
}

export interface PagoRow {
  id: string;
  compra_id: string;
  orden_id: string | null;
  mp_payment_id: string | null;
  mp_preference_id: string | null;
  estado: EstadoPago;
  monto_centavos: string;
  moneda: string;
  mp_status: string | null;
  mp_status_detail: string | null;
  reembolso_pendiente: boolean;
  motivo_reembolso: string | null;
  mp_refund_id: string | null;
  aprobado_en: string | null;
  reembolsado_en: string | null;
  revision_admin: boolean;
  revision_motivo: string | null;
  payouts_pagados_al_reembolsar: number;
  creado_en: string;
  actualizado_en: string;
}

export interface MovimientoRow {
  id: string;
  pago_id: string;
  compra_id: string;
  orden_id: string | null;
  usuario_id: string | null;
  tipo: TipoMovimiento;
  monto_centavos: string;
  estado: EstadoMovimiento;
  payout_referencia: string | null;
  payout_destino: string | null;
  payout_admin_id: string | null;
  liberado_en: string | null;
  liberable_desde: string | null;
  pagado_en: string | null;
  creado_en: string;
}

// ── API ────────────────────────────────────────────────────────────────────
export interface PagoResumen {
  id: string;
  estado: EstadoPago;
  mpStatus: string | null;
  montoCentavos: number;
  moneda: string;
  reembolsoPendiente: boolean;
  creadoEn: string;
  aprobadoEn: string | null;
}

export interface EstadoPagoResponse {
  compraId: string;
  tipo: TipoCompra;
  estadoCompra: EstadoCompra;
  montoCentavos: number | null;
  moneda: string;
  // Último intento de pago (null si todavía no se inició ninguno).
  pago: PagoResumen | null;
}

export interface IniciarPagoResultado {
  pagoId: string;
  initPoint: string;
}

export interface MovimientoBilletera {
  id: string;
  tipo: TipoMovimiento;
  estado: EstadoMovimiento;
  montoCentavos: number;
  compraId: string;
  ordenId: string | null;
  creadoEn: string;
  liberadoEn: string | null;
  // Desde cuándo se puede pagar el payout (retención de descargas); null si no aplica.
  liberableDesde: string | null;
  pagadoEn: string | null;
}

export interface ResumenBilletera {
  retenidoCentavos: number;
  pendientePayoutCentavos: number;
  pagadoCentavos: number;
  cuentaMercadopagoConfigurada: boolean;
  // Tras cambiar la cuenta no se puede pagar a ella hasta esta fecha (cooldown de 24 h).
  cuentaMercadopagoEnCooldown: boolean;
  cuentaMercadopagoHabilitadaDesde: string | null;
}

export interface BilleteraResponse {
  data: MovimientoBilletera[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  resumen: ResumenBilletera;
}

export interface PayoutPendiente {
  id: string;
  tipo: TipoMovimiento;
  montoCentavos: number;
  compraId: string;
  ordenId: string | null;
  liberadoEn: string | null;
  liberableDesde: string | null;
  // pagable = fuera de retención, sin cooldown de cuenta y con cuenta configurada.
  enRetencion: boolean;
  cuentaEnCooldown: boolean;
  cuentaHabilitadaDesde: string | null;
  pagable: boolean;
  usuario: {
    id: string;
    email: string;
    cuentaMercadopago: string | null;
  };
}

export interface PagoEnRevision {
  id: string;
  compraId: string;
  estado: EstadoPago;
  montoCentavos: number;
  revisionMotivo: string | null;
  payoutsPagadosAlReembolsar: number;
  mpStatus: string | null;
  creadoEn: string;
}

export type ResultadoReembolso = "no_aplica" | "reembolsado" | "pendiente";

export type ResultadoWebhook =
  | "procesado"
  | "duplicado"
  | "ignorado"
  | "rechazado"
  | "reintentable"
  | "firma_invalida";
