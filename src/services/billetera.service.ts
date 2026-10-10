import {
  BilleteraResponse,
  EstadoMovimiento,
  MovimientoRow,
  PayoutPendiente,
} from "../interfaces/pago.interface";
import { PaginatedResponse, PaginationParams } from "../interfaces/pagination.interface";
import { movimientoRepository } from "../repositories/movimiento.repository";
import { userRepository } from "../repositories/user.repository";
import { ConflictError, NotFoundError } from "../errors/app-error";
import { toCentavos } from "../utils/money.util";
import {
  cuentaEnCooldown,
  cuentaHabilitadaDesde,
  enRetencion,
} from "../utils/policy.util";
import { withTransaction } from "../utils/transaction.util";

const ESTADOS_BILLETERA: EstadoMovimiento[] = [
  "retenido",
  "pendiente_payout",
  "pagado",
];

function mapMovimiento(row: MovimientoRow) {
  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    montoCentavos: toCentavos(row.monto_centavos),
    compraId: row.compra_id,
    ordenId: row.orden_id,
    creadoEn: row.creado_en,
    liberadoEn: row.liberado_en,
    liberableDesde: row.liberable_desde,
    pagadoEn: row.pagado_en,
  };
}

export const billeteraService = {
  // Solo movimientos del propio usuario (usuario_id = JWT), nunca de la plataforma ni de terceros.
  async getMiBilletera(
    userId: string,
    pagination: PaginationParams,
    estado?: EstadoMovimiento,
  ): Promise<BilleteraResponse> {
    const { page, limit } = pagination;
    const estados = estado ? [estado] : ESTADOS_BILLETERA;

    const [{ rows, total }, sumas, usuario] = await Promise.all([
      movimientoRepository.listarPorUsuario(userId, estados, limit, (page - 1) * limit),
      movimientoRepository.sumasPorEstado(userId),
      userRepository.findById(userId),
    ]);

    return {
      data: rows.map(mapMovimiento),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      resumen: {
        retenidoCentavos: sumas.retenido,
        pendientePayoutCentavos: sumas.pendiente_payout,
        pagadoCentavos: sumas.pagado,
        cuentaMercadopagoConfigurada: Boolean(usuario?.cuenta_mercadopago),
        cuentaMercadopagoEnCooldown: cuentaEnCooldown(
          usuario?.cuenta_mercadopago_actualizada_en,
        ),
        cuentaMercadopagoHabilitadaDesde:
          cuentaHabilitadaDesde(usuario?.cuenta_mercadopago_actualizada_en)?.toISOString() ??
          null,
      },
    };
  },

  async listarPayoutsPendientes(
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<PayoutPendiente>> {
    const { page, limit } = pagination;
    const { rows, total } = await movimientoRepository.listarPayoutsPendientes(
      limit,
      (page - 1) * limit,
    );
    return {
      data: rows.map((row) => {
        const retenido = enRetencion(row.liberable_desde);
        const cooldown = cuentaEnCooldown(row.cuenta_mercadopago_actualizada_en);
        return {
          id: row.id,
          tipo: row.tipo,
          montoCentavos: toCentavos(row.monto_centavos),
          compraId: row.compra_id,
          ordenId: row.orden_id,
          liberadoEn: row.liberado_en,
          liberableDesde: row.liberable_desde,
          enRetencion: retenido,
          cuentaEnCooldown: cooldown,
          cuentaHabilitadaDesde:
            cuentaHabilitadaDesde(row.cuenta_mercadopago_actualizada_en)?.toISOString() ??
            null,
          pagable: !retenido && !cooldown && Boolean(row.cuenta_mercadopago),
          usuario: {
            id: row.usuario_id as string,
            email: row.email,
            cuentaMercadopago: row.cuenta_mercadopago,
          },
        };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  // Registro manual de una transferencia ya hecha al vendedor. Idempotente: repetir la misma
  // referencia sobre un movimiento ya pagado devuelve el mismo resultado; otra referencia es 409.
  // Rechaza payouts en retención o hacia una cuenta cambiada hace menos de 24 h, y deja
  // auditados la cuenta destino y el admin que lo registró.
  async marcarPayoutPagado(
    movimientoId: string,
    referencia: string,
    adminId: string | null,
  ): Promise<ReturnType<typeof mapMovimiento>> {
    return withTransaction(async (client) => {
      const mov = await movimientoRepository.lockPorId(client, movimientoId);
      if (!mov) throw new NotFoundError("Movimiento no encontrado");

      if (mov.estado === "pagado") {
        if (mov.payout_referencia === referencia) return mapMovimiento(mov);
        throw new ConflictError("El payout ya fue registrado con otra referencia");
      }
      if (mov.estado !== "pendiente_payout" || !mov.usuario_id) {
        throw new ConflictError("El movimiento no está pendiente de payout");
      }
      if (enRetencion(mov.liberable_desde)) {
        throw new ConflictError(
          `El payout está en período de retención hasta ${new Date(mov.liberable_desde as string).toISOString()}`,
        );
      }

      const cuenta = await userRepository.getCuentaPayout(client, mov.usuario_id);
      if (!cuenta?.cuenta_mercadopago) {
        throw new ConflictError("El vendedor no tiene una cuenta de Mercado Pago configurada");
      }
      if (cuentaEnCooldown(cuenta.cuenta_mercadopago_actualizada_en)) {
        throw new ConflictError(
          `La cuenta del vendedor cambió hace menos de 24 h: pagable desde ${cuentaHabilitadaDesde(cuenta.cuenta_mercadopago_actualizada_en)?.toISOString()}`,
        );
      }

      const pagado = await movimientoRepository.marcarPagado(client, movimientoId, referencia, {
        destino: cuenta.cuenta_mercadopago,
        adminId,
      });
      if (!pagado) throw new ConflictError("El movimiento no está pendiente de payout");
      return mapMovimiento(pagado);
    });
  },
};
