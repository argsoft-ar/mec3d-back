import { EstadoCompra, ResultadoReembolso } from "./pago.interface";

export type EstadoOrdenFabricacion =
  | "solicitado"
  | "en_negociacion"
  | "trato_cerrado"
  | "confirmada"
  | "en_disputa"
  | "rechazado"
  | "cancelado"
  | "completado";

export interface OrdenFabricacion {
  id: string;
  compraId: string;
  fabricanteId: string;
  estado: EstadoOrdenFabricacion;
  precioAcordado: number | null;
  precioPropuestoComprador: number | null;
  precioPropuestoFabricante: number | null;
  cerradoPorComprador: boolean;
  cerradoPorFabricante: boolean;
  cerradoEn: string | null;
  creadoEn: string;
  // Estado de la compra asociada (cuando la consulta lo trae): indica si el pago está acreditado.
  compraEstado: EstadoCompra | null;
  // Disputa (solo con la orden 'en_disputa' o ya resuelta).
  disputaMotivo: string | null;
  disputaAbiertaEn: string | null;
  disputaResolucion: ResolucionDisputa | null;
}

export type ResolucionDisputa = "liberar_fabricante" | "reembolsar_comprador";

export interface CreateOrdenesFabricacionDTO {
  compraId: string;
  fabricanteIds: string[];
}

export interface ProponerPrecioDTO {
  precio: number;
}

export interface CerrarTratoDTO {
  precio: number;
}

export interface ConfirmarEntregaOrdenDTO {
  codigo: string;
}

export interface CodigoEntregaResponse {
  codigoEntrega: string;
}

export interface OrdenFabricacionListItem extends OrdenFabricacion {
  productoTitulo: string;
  conversacionId: string | null;
}

export interface FabricanteSugerido {
  id: string;
  zonaId: number | null;
  puntuacion: number;
  tagline: string | null;
  username: string | null;
}

export interface DisputaItem {
  ordenId: string;
  compraId: string;
  compradorId: string;
  fabricanteId: string;
  estadoOrden: EstadoOrdenFabricacion;
  estadoCompra: EstadoCompra;
  montoCentavos: number | null;
  motivo: string | null;
  abiertaPor: string | null;
  abiertaEn: string | null;
  resolucion: ResolucionDisputa | null;
  resueltaPor: string | null;
  resueltaEn: string | null;
  nota: string | null;
}

export interface ResolverDisputaResultado {
  orden: OrdenFabricacion;
  resolucion: ResolucionDisputa;
  // true si la disputa ya estaba resuelta igual y esta llamada solo reintentó lo pendiente.
  idempotente: boolean;
  // Solo reembolsar_comprador.
  reembolso: ResultadoReembolso;
  // Payouts ya transferidos que el reembolso no pudo revertir (requiere recuperación manual).
  payoutsYaPagados: number;
}

export interface CancelarOrdenResultado {
  orden: OrdenFabricacion;
  reembolso: ResultadoReembolso;
}

export interface CerrarTratoResultado {
  orden: OrdenFabricacion;
  // true cuando este cierre finalizó el trato y el comprador debe pagar el precio acordado.
  pagoRequerido: boolean;
  // Checkout Pro; solo si cerró el comprador y la preference se creó (si no: POST /compras/:id/pagar).
  initPoint: string | null;
}

export interface OrdenFabricacionCreada extends OrdenFabricacion {
  conversacionId: string;
}
