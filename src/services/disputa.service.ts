import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { compraRepository } from "../repositories/compra.repository";
import { pagoRepository } from "../repositories/pago.repository";
import {
  DisputaItem,
  OrdenFabricacion,
  ResolucionDisputa,
  ResolverDisputaResultado,
} from "../interfaces/orden-fabricacion.interface";
import { PaginatedResponse, PaginationParams } from "../interfaces/pagination.interface";
import { MovimientoRow, ResultadoReembolso } from "../interfaces/pago.interface";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors/app-error";
import { toCentavos } from "../utils/money.util";
import { withTransaction } from "../utils/transaction.util";
import { emitirMensajeSistema, mapOrden } from "./orden-fabricacion.service";
import { pagoService } from "./pago.service";
import { solicitarPayouts } from "./payout.provider";

function mapDisputa(row: any): DisputaItem {
  return {
    ordenId: row.id,
    compraId: row.compra_id,
    compradorId: row.id_comprador,
    fabricanteId: row.fabricante_id,
    estadoOrden: row.estado,
    estadoCompra: row.compra_estado,
    montoCentavos: row.monto_centavos === null ? null : toCentavos(row.monto_centavos),
    motivo: row.disputa_motivo,
    abiertaPor: row.disputa_abierta_por,
    abiertaEn: row.disputa_abierta_en,
    resolucion: row.disputa_resolucion,
    resueltaPor: row.disputa_resuelta_por,
    resueltaEn: row.disputa_resuelta_en,
    nota: row.disputa_nota,
  };
}

export const disputaService = {
  // El comprador congela los fondos: la orden pasa a 'en_disputa' (no se puede confirmar la
  // entrega, cancelar ni descargar) hasta que un admin la resuelve. Los movimientos quedan
  // 'retenido'. Requiere la compra pagada; locks compra -> orden.
  async abrir(ordenId: string, userId: string, motivo: string): Promise<OrdenFabricacion> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) throw new NotFoundError("Orden de fabricación no encontrada");
    if (orden.id_comprador !== userId) {
      throw new ForbiddenError("Solo el comprador puede abrir una disputa");
    }

    const actualizada = await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, orden.compra_id);
      const bloqueada = await ordenFabricacionRepository.lockById(client, ordenId);
      if (!compra || !bloqueada) throw new NotFoundError("Orden de fabricación no encontrada");
      if (bloqueada.estado === "en_disputa") {
        throw new ConflictError("La orden ya está en disputa");
      }
      if (bloqueada.estado !== "confirmada" && bloqueada.estado !== "trato_cerrado") {
        throw new ConflictError("La orden no está en condiciones de abrir una disputa");
      }
      if (compra.estado !== "pagada") {
        throw new ConflictError("Solo se puede disputar una orden con el pago acreditado");
      }
      const abierta = await ordenFabricacionRepository.abrirDisputa(
        client,
        ordenId,
        userId,
        motivo,
      );
      if (!abierta) throw new ConflictError("La orden no está en condiciones de abrir una disputa");
      return abierta;
    });

    await emitirMensajeSistema(
      ordenId,
      "El comprador abrió una disputa: los fondos quedan congelados hasta que un administrador la resuelva",
      "orden-en-disputa",
    );
    return mapOrden({ ...actualizada, compra_estado: "pagada" });
  },

  async listar(
    pagination: PaginationParams,
    estado: "abiertas" | "resueltas" = "abiertas",
  ): Promise<PaginatedResponse<DisputaItem>> {
    const { page, limit } = pagination;
    const { rows, total } = await ordenFabricacionRepository.listarDisputas(
      estado,
      limit,
      (page - 1) * limit,
    );
    return {
      data: rows.map(mapDisputa),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  // Resolución transaccional (locks compra -> orden -> pago) e idempotente: repetir la misma
  // resolución no vuelve a mover fondos (solo reintenta un reembolso que haya quedado pendiente);
  // otra resolución distinta sobre una disputa ya resuelta es 409. Queda auditado quién, cuándo y por qué.
  async resolver(
    ordenId: string,
    adminId: string,
    resolucion: ResolucionDisputa,
    nota: string,
  ): Promise<ResolverDisputaResultado> {
    const orden = await ordenFabricacionRepository.getById(ordenId);
    if (!orden) throw new NotFoundError("Orden de fabricación no encontrada");

    const { resuelta, idempotente, pagoId, liberados } = await withTransaction(
      async (client) => {
        const compra = await compraRepository.lockById(client, orden.compra_id);
        const bloqueada = await ordenFabricacionRepository.lockById(client, ordenId);
        if (!compra || !bloqueada) {
          throw new NotFoundError("Orden de fabricación no encontrada");
        }

        if (bloqueada.disputa_resolucion) {
          if (bloqueada.disputa_resolucion !== resolucion) {
            throw new ConflictError(
              `La disputa ya fue resuelta con otra resolución (${bloqueada.disputa_resolucion})`,
            );
          }
          // Misma resolución: nada que mover; un reembolso pendiente se reintenta luego del commit.
          const pago =
            resolucion === "reembolsar_comprador"
              ? await pagoRepository.getUltimoPorCompra(compra.id, client)
              : null;
          const pendiente =
            pago && pago.estado === "aprobado" && pago.reembolso_pendiente ? pago.id : null;
          return {
            resuelta: bloqueada,
            idempotente: true,
            pagoId: pendiente,
            liberados: [] as MovimientoRow[],
          };
        }

        if (bloqueada.estado !== "en_disputa") {
          throw new ConflictError("La orden no está en disputa");
        }
        if (compra.estado !== "pagada") {
          throw new ConflictError("La compra no tiene fondos retenidos para resolver");
        }

        let liberados: MovimientoRow[] = [];
        let pagoId: string | null = null;

        if (resolucion === "liberar_fabricante") {
          if (!(await compraRepository.completar(client, compra.id, { entrega: true }))) {
            throw new ConflictError("La compra ya fue completada");
          }
          liberados = await pagoService.liberarRetenidos(client, compra.id);
        } else {
          const pago = await pagoRepository.lockAprobadoPrincipalPorCompra(client, compra.id);
          if (!pago) throw new ConflictError("No hay un pago aprobado para reembolsar");
          if (!(await compraRepository.cancelar(client, compra.id))) {
            throw new ConflictError("La compra ya no puede cancelarse");
          }
          await pagoRepository.marcarReembolsoPendiente(client, pago.id, "disputa_reembolso_comprador");
          pagoId = pago.id;
        }

        const resuelta = await ordenFabricacionRepository.resolverDisputa(client, ordenId, {
          resolucion,
          adminId,
          nota,
        });
        if (!resuelta) throw new ConflictError("La orden no está en disputa");
        return { resuelta, idempotente: false, pagoId, liberados };
      },
    );

    let reembolso: ResultadoReembolso = "no_aplica";
    let payoutsYaPagados = 0;
    if (pagoId) {
      try {
        const r = await pagoService.reembolsarConDetalle(pagoId, "disputa_reembolso_comprador");
        reembolso = r.resultado;
        payoutsYaPagados = r.yaPagados;
      } catch (error) {
        console.error(
          `❌ Reembolso de la disputa de la orden ${ordenId} quedó pendiente:`,
          error instanceof Error ? error.message : error,
        );
        reembolso = "pendiente";
      }
    }

    if (!idempotente) {
      await solicitarPayouts(liberados);
      await emitirMensajeSistema(
        ordenId,
        resolucion === "liberar_fabricante"
          ? "Un administrador resolvió la disputa a favor del fabricante"
          : "Un administrador resolvió la disputa a favor del comprador (reembolso)",
        "disputa-resuelta",
        { resolucion },
      );
    }

    return {
      orden: mapOrden({
        ...resuelta,
        compra_estado: resolucion === "liberar_fabricante" ? "completada" : "cancelada",
      }),
      resolucion,
      idempotente,
      reembolso,
      payoutsYaPagados,
    };
  },
};
