import { NuevoMovimiento } from "../repositories/movimiento.repository";
import { TipoCompra } from "../interfaces/pago.interface";
import {
  ComisionesConfig,
  Desglose,
  calcularDesgloseDescarga,
  calcularDesgloseFabricacion,
} from "./comisiones.util";

export interface ContextoLedger {
  pagoId: string;
  compraId: string;
  ordenId: string | null;
  tipoCompra: TipoCompra;
  montoCentavos: number;
  disenadorId: string;
  // Solo en fabricación.
  fabricanteId: string | null;
}

export function calcularDesglose(
  ctx: Pick<ContextoLedger, "tipoCompra" | "montoCentavos">,
  config: ComisionesConfig,
): Desglose {
  return ctx.tipoCompra === "descarga"
    ? calcularDesgloseDescarga(ctx.montoCentavos, config)
    : calcularDesgloseFabricacion(ctx.montoCentavos, config);
}

// Movimientos de un pago aprobado: la retención por el total + el desglose (cuya suma es
// exactamente el monto del pago). Todo nace 'retenido'; la liberación es un paso aparte.
export function construirMovimientos(
  ctx: ContextoLedger,
  config: ComisionesConfig,
): NuevoMovimiento[] {
  const desglose = calcularDesglose(ctx, config);

  const usuarioDe = (destinatario: "plataforma" | "disenador" | "fabricante") => {
    if (destinatario === "plataforma") return null;
    if (destinatario === "disenador") return ctx.disenadorId;
    if (!ctx.fabricanteId) {
      throw new Error("Pago de fabricación sin fabricante asignado");
    }
    return ctx.fabricanteId;
  };

  const base = {
    pagoId: ctx.pagoId,
    compraId: ctx.compraId,
    ordenId: ctx.ordenId,
    estado: "retenido" as const,
  };

  return [
    {
      ...base,
      usuarioId: null,
      tipo: "retencion",
      montoCentavos: ctx.montoCentavos,
    },
    ...desglose.partes.map(
      (parte): NuevoMovimiento => ({
        ...base,
        usuarioId: usuarioDe(parte.destinatario),
        tipo: parte.tipo,
        montoCentavos: parte.montoCentavos,
      }),
    ),
  ];
}
