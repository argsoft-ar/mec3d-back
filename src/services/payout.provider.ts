import { MovimientoRow } from "../interfaces/pago.interface";
import { userRepository } from "../repositories/user.repository";
import { movimientoRepository } from "../repositories/movimiento.repository";
import { toCentavos } from "../utils/money.util";
import { cuentaEnCooldown, enRetencion } from "../utils/policy.util";
import { withTransaction } from "../utils/transaction.util";

export interface PayoutRequest {
  movimientoId: string;
  usuarioId: string;
  montoCentavos: number;
  // usuarios.cuenta_mercadopago; null si el vendedor todavía no la cargó.
  destino: string | null;
}

export interface PayoutResult {
  // 'pagado' solo lo devuelve un proveedor que transfiere de forma automática.
  estado: "pendiente_payout" | "pagado";
  referencia: string | null;
}

// Punto de extensión para pagar a vendedores. Hoy Checkout Pro cobra en la cuenta de la
// plataforma y el payout es manual; un proveedor automático implementa esta interfaz.
export interface PayoutProvider {
  readonly nombre: string;
  solicitarPayout(request: PayoutRequest): Promise<PayoutResult>;
}

// El movimiento queda 'pendiente_payout' hasta que un admin registra la transferencia.
export class ManualPayoutProvider implements PayoutProvider {
  readonly nombre = "manual";

  async solicitarPayout(): Promise<PayoutResult> {
    return { estado: "pendiente_payout", referencia: null };
  }
}

export const payoutProvider: PayoutProvider = new ManualPayoutProvider();

// Tras liberar fondos, pide el payout de cada movimiento a un vendedor (best effort: un
// fallo del proveedor nunca revierte la liberación, el movimiento sigue pendiente).
export async function solicitarPayouts(
  movimientos: MovimientoRow[],
  provider: PayoutProvider = payoutProvider,
): Promise<void> {
  for (const mov of movimientos) {
    if (!mov.usuario_id || enRetencion(mov.liberable_desde)) continue;
    try {
      const usuario = await userRepository.findById(mov.usuario_id);
      if (cuentaEnCooldown(usuario?.cuenta_mercadopago_actualizada_en)) continue;
      const resultado = await provider.solicitarPayout({
        movimientoId: mov.id,
        usuarioId: mov.usuario_id,
        montoCentavos: toCentavos(mov.monto_centavos),
        destino: usuario?.cuenta_mercadopago ?? null,
      });
      if (resultado.estado === "pagado") {
        await withTransaction(async (client) => {
          const bloqueado = await movimientoRepository.lockPayoutPendiente(
            client,
            mov.id,
          );
          if (bloqueado) {
            await movimientoRepository.marcarPagado(
              client,
              mov.id,
              resultado.referencia ?? `${provider.nombre}:${mov.id}`,
              {
                destino: usuario?.cuenta_mercadopago ?? `proveedor:${provider.nombre}`,
                adminId: null,
              },
            );
          }
        });
      }
    } catch (error) {
      console.error(
        `❌ Payout ${provider.nombre} falló para el movimiento ${mov.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
