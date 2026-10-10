import { EstadoCompra, TipoCompra } from "./pago.interface";

export interface Compra {
  id: string;
  idComprador: string;
  idModelo: string;
  idDisenador: string;
  tipo: TipoCompra;
  estado: EstadoCompra;
  // Monto en centavos de ARS; null en fabricación hasta cerrarse el trato.
  montoCentavos: number | null;
  moneda: string;
  // Mismo monto en pesos (para mostrar); null mientras no haya monto.
  precioPagado: number | null;
  fecha: string;
  pagadaEn: string | null;
  entregaConfirmada: boolean;
  entregadoEn: string | null;
  fondosLiberados: boolean;
  fondosLiberadosEn: string | null;
  // Material elegido por el comprador (uno de los materiales del diseño) o null.
  material: string | null;
}

export interface CreateCompraDTO {
  disenoId: string;
  tipo: TipoCompra;
  material?: string;
}

export interface CrearCompraResultado {
  compra: Compra;
  // Checkout Pro (descarga). null en fabricación: se paga al cerrarse el trato.
  initPoint: string | null;
}

export interface CompraDisenoInfo {
  titulo: string;
  imagenUrl: string | null;
  formato: string | null;
}

export interface MisComprasItem extends Compra {
  diseno: CompraDisenoInfo;
  ordenFabricacionId: string | null;
  ordenFabricacionEstado: string | null;
}
