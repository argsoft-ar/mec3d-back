import { createHash } from "node:crypto";
import { PoolClient } from "pg";
import { getMercadoPagoSettings } from "../config/env.config";
import { getMercadoPagoClients } from "../config/mercadopago.config";
import {
  CompraRow,
  EstadoPagoResponse,
  IniciarPagoResultado,
  MovimientoRow,
  PagoRow,
  PagoResumen,
  ResultadoReembolso,
  ResultadoWebhook,
} from "../interfaces/pago.interface";
import { compraRepository } from "../repositories/compra.repository";
import { comisionRepository } from "../repositories/comision.repository";
import { disenoRepository } from "../repositories/diseno.repository";
import { ordenFabricacionRepository } from "../repositories/orden-fabricacion.repository";
import { DatosMpPago, pagoRepository } from "../repositories/pago.repository";
import { movimientoRepository } from "../repositories/movimiento.repository";
import { webhookEventoRepository, NuevoWebhookEvento } from "../repositories/webhook-evento.repository";
import {
  webhookNotificationSchema,
  webhookQuerySchema,
} from "../schemas/pago.schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors/app-error";
import { construirMovimientos } from "../utils/ledger.util";
import { centavosAPesos, pesosACentavos, toCentavos } from "../utils/money.util";
import { verificarFirmaMercadoPago } from "../utils/mp-signature.util";
import { getPayoutHoldDays } from "../utils/policy.util";
import { withTransaction } from "../utils/transaction.util";
import { solicitarPayouts } from "./payout.provider";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPIRACION_PREFERENCE_MS = 24 * 60 * 60 * 1000;
// Reintentos (503) que se le piden a MP cuando el pago aún no está disponible en su API.
export const MAX_REINTENTOS_WEBHOOK = 5;

// Subconjunto de la respuesta de GET /v1/payments/:id que usamos.
export interface MpPayment {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  currency_id?: string;
  metadata?: Record<string, unknown>;
  date_approved?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  operation_type?: string;
}

export interface WebhookRequest {
  query: unknown;
  body: unknown;
  xSignature: string | undefined;
  xRequestId: string | undefined;
}

export interface WebhookResponse {
  // 503 = el pago aún no está disponible en MP: MP debe reintentar la notificación.
  httpStatus: 200 | 401 | 503;
  resultado: ResultadoWebhook;
}

export interface ResumenReconciliacion {
  revisadas: number;
  acreditados: number;
  errores: number;
}

interface ResultadoAplicacion {
  estado: "procesado" | "ignorado" | "rechazado";
  detalle: string;
  // Pagos aprobados que deben devolverse (se ejecuta después del commit).
  reembolsar: string[];
  liberados: MovimientoRow[];
}

// Re-consulta el pago a MP (se usa dentro del lock del pago para no actuar sobre un estado viejo).
type Refetch = () => Promise<MpPayment>;

function resultado(
  estado: ResultadoAplicacion["estado"],
  detalle: string,
  extra: Partial<Pick<ResultadoAplicacion, "reembolsar" | "liberados">> = {},
): ResultadoAplicacion {
  return { estado, detalle, reembolsar: [], liberados: [], ...extra };
}

function alertar(mensaje: string): void {
  console.error(`🚨 ALERTA PAGOS: ${mensaje}`);
}

// Allowlist: nunca se persiste el pagador, la tarjeta ni el payload completo de MP.
function datosMp(payment: MpPayment): DatosMpPago {
  return {
    mpStatus: payment.status ?? null,
    mpStatusDetail: payment.status_detail ?? null,
    raw: {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      transaction_amount: payment.transaction_amount,
      transaction_amount_refunded: payment.transaction_amount_refunded,
      currency_id: payment.currency_id,
      external_reference: payment.external_reference,
      date_approved: payment.date_approved,
      payment_method_id: payment.payment_method_id,
      payment_type_id: payment.payment_type_id,
      operation_type: payment.operation_type,
    },
  };
}

function mapPagoResumen(row: PagoRow): PagoResumen {
  return {
    id: row.id,
    estado: row.estado,
    mpStatus: row.mp_status,
    montoCentavos: toCentavos(row.monto_centavos),
    moneda: row.moneda,
    reembolsoPendiente: row.reembolso_pendiente,
    creadoEn: row.creado_en,
    aprobadoEn: row.aprobado_en,
  };
}

// Pago ya cobrado en MP sin fila local: se vincula por metadata.pago_id (de la preference)
// o se crea una fila nueva (otro intento de pago sobre la misma compra).
async function resolverPagoLocal(
  client: PoolClient,
  compra: CompraRow,
  payment: MpPayment,
  montoCentavos: number,
  mpPaymentId: string,
  datos: DatosMpPago,
  moneda = "ARS",
): Promise<PagoRow> {
  const hintId = payment.metadata?.pago_id;
  let ordenId: string | null = null;

  if (typeof hintId === "string" && UUID_RE.test(hintId)) {
    const hint = await pagoRepository.lockById(client, hintId);
    if (hint && hint.compra_id === compra.id) {
      ordenId = hint.orden_id;
      if (
        hint.mp_payment_id === null &&
        toCentavos(hint.monto_centavos) === montoCentavos
      ) {
        await pagoRepository.asignarMpPayment(client, hint.id, mpPaymentId, datos);
        return { ...hint, mp_payment_id: mpPaymentId };
      }
    }
  }

  return pagoRepository.insertarDesdeMp(client, {
    compraId: compra.id,
    ordenId,
    mpPaymentId,
    montoCentavos,
    moneda,
    ...datos,
  });
}

// Reflejo local de un reembolso confirmado en MP. Si el pago respaldaba el ledger de la
// compra, la compra queda 'reembolsada' y la orden en curso se cancela; si era un pago
// duplicado/tardío solo se devuelve ese pago.
async function aplicarReembolsoLocal(
  client: PoolClient,
  compra: CompraRow,
  pago: PagoRow,
  refundId: string | null,
  mpStatus: string | null,
): Promise<{ yaPagados: number }> {
  const marcado = await pagoRepository.marcarReembolsado(
    client,
    pago.id,
    refundId,
    mpStatus,
  );
  if (!marcado) return { yaPagados: 0 };

  const esPrincipal = await movimientoRepository.existeRetencion(client, pago.id);
  const { yaPagados } = await movimientoRepository.reembolsarPorPago(
    client,
    pago.id,
  );
  // El ledger es en ARS: un pago en otra moneda no genera movimiento contable.
  if (pago.moneda === "ARS") {
    await movimientoRepository.insertarReembolso(client, {
      pagoId: pago.id,
      compraId: compra.id,
      ordenId: pago.orden_id,
      compradorId: compra.id_comprador,
      montoCentavos: toCentavos(pago.monto_centavos),
    });
  }

  if (esPrincipal) {
    await compraRepository.marcarReembolsada(client, compra.id);
    await ordenFabricacionRepository.cancelarCerradaPorCompra(client, compra.id);
  }
  if (yaPagados > 0) {
    // Payouts ya transferidos a vendedores: son irreversibles desde acá. Queda auditado.
    await pagoRepository.marcarRevisionAdmin(
      client,
      pago.id,
      "payouts_pagados_al_reembolsar",
      yaPagados,
    );
    alertar(
      `el pago ${pago.id} (compra ${compra.id}) se reembolsó con ${yaPagados} payout(s) ya transferido(s): recuperar los fondos manualmente`,
    );
  }
  return { yaPagados };
}

// Reembolso que MP hizo antes de que el pago llegara a aprobarse localmente (notificaciones
// fuera de orden): se registra devuelto y nunca llega a retener fondos.
async function registrarReembolsoSinAprobar(
  client: PoolClient,
  compra: CompraRow,
  pago: PagoRow,
  mpStatus: string | null,
): Promise<void> {
  const marcado = await pagoRepository.marcarReembolsadoSinAprobar(
    client,
    pago.id,
    "reembolsado_en_mp_antes_de_aprobar",
    mpStatus,
  );
  if (!marcado) return;
  if (pago.moneda === "ARS") {
    await movimientoRepository.insertarReembolso(client, {
      pagoId: pago.id,
      compraId: compra.id,
      ordenId: pago.orden_id,
      compradorId: compra.id_comprador,
      montoCentavos: toCentavos(pago.monto_centavos),
    });
  }
}

async function aprobarPago(
  client: PoolClient,
  compra: CompraRow,
  pago: PagoRow,
  datos: DatosMpPago,
  orden: { id: string; estado: string; fabricante_id: string } | null,
): Promise<ResultadoAplicacion> {
  if (pago.estado === "aprobado" || pago.estado === "reembolsado") {
    return resultado("procesado", "pago_ya_procesado");
  }

  const vigente =
    compra.estado === "pendiente_pago" &&
    (compra.tipo === "descarga" || orden?.estado === "trato_cerrado");

  if (!(await pagoRepository.marcarAprobado(client, pago.id, datos))) {
    throw new Error(`No se pudo aprobar el pago ${pago.id}`);
  }

  if (!vigente) {
    // Plata cobrada que no corresponde a una compra abierta: se devuelve.
    const motivo =
      compra.estado === "pendiente_pago"
        ? "orden_no_vigente"
        : compra.estado === "cancelada"
          ? "compra_cancelada"
          : "pago_duplicado";
    await pagoRepository.marcarReembolsoPendiente(client, pago.id, motivo);
    return resultado("procesado", `pago_a_reembolsar:${motivo}`, {
      reembolsar: [pago.id],
    });
  }

  if (!(await compraRepository.marcarPagada(client, compra.id))) {
    throw new Error(`No se pudo marcar pagada la compra ${compra.id}`);
  }

  const monto = toCentavos(pago.monto_centavos);
  const config = await comisionRepository.getConfig(client);
  const movimientos = construirMovimientos(
    {
      pagoId: pago.id,
      compraId: compra.id,
      ordenId: orden?.id ?? null,
      tipoCompra: compra.tipo,
      montoCentavos: monto,
      disenadorId: compra.id_disenador,
      fabricanteId: orden?.fabricante_id ?? null,
    },
    config,
  );
  for (const mov of movimientos) {
    await movimientoRepository.insertar(client, mov);
  }
  // Invariante del ledger: el desglose suma exactamente lo cobrado.
  const suma = await movimientoRepository.sumaDesglose(client, pago.id);
  if (suma !== monto) {
    throw new Error(
      `Invariante del ledger violada en el pago ${pago.id}: ${suma} != ${monto}`,
    );
  }

  if (compra.tipo === "descarga") {
    // Descarga directa: no hay entrega física que esperar, se libera al aprobarse; el payout
    // al vendedor queda retenido PAYOUT_HOLD_DAYS (liberable_desde) ante contracargos.
    const liberados = await movimientoRepository.liberarPorPago(
      client,
      pago.id,
      getPayoutHoldDays(),
    );
    if (!(await compraRepository.completar(client, compra.id, { entrega: false }))) {
      throw new Error(`No se pudo completar la compra ${compra.id}`);
    }
    return resultado("procesado", "pago_aprobado_liberado", { liberados });
  }

  return resultado("procesado", "pago_aprobado_retenido");
}

// Estimación en centavos de un monto que no cierra a 2 decimales: solo para poder registrar
// (y reembolsar) un cobro anómalo; nunca se usa para acreditar.
function aproximarCentavos(monto: unknown): number | null {
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.round(n * 100));
}

// Pago aprobado en MP con moneda o monto que no corresponden a la compra: se registra tal
// cual, se marca para reembolso automático (lo ejecuta el scheduler o el post-commit) y se
// alerta. Nunca acredita ni toca el ledger.
async function registrarCobroInvalido(
  client: PoolClient,
  compra: CompraRow,
  payment: MpPayment,
  motivo: "moneda_invalida" | "monto_invalido",
  montoCentavos: number | null,
): Promise<ResultadoAplicacion> {
  const mpPaymentId = String(payment.id);
  const moneda = /^[A-Z]{3}$/.test(payment.currency_id ?? "") ? (payment.currency_id as string) : null;
  const centavos = montoCentavos ?? aproximarCentavos(payment.transaction_amount);
  if (!moneda || centavos === null) {
    alertar(
      `pago ${mpPaymentId} aprobado en MP con moneda/monto ilegibles (compra ${compra.id}): reembolsar manualmente`,
    );
    return resultado("rechazado", `${motivo}:no_registrable`);
  }

  const datos = datosMp(payment);
  let pago = await pagoRepository.lockByMpPaymentId(client, mpPaymentId);
  if (pago) {
    if (pago.compra_id !== compra.id) {
      return resultado("rechazado", "pago_inconsistente_con_la_compra");
    }
    if (pago.estado === "aprobado" || pago.estado === "reembolsado") {
      return resultado("procesado", "pago_ya_procesado");
    }
  } else {
    pago = await pagoRepository.insertarDesdeMp(client, {
      compraId: compra.id,
      ordenId: null,
      mpPaymentId,
      montoCentavos: centavos,
      moneda,
      ...datos,
    });
  }

  if (!(await pagoRepository.marcarAprobado(client, pago.id, datos))) {
    throw new Error(`No se pudo registrar el pago ${pago.id}`);
  }
  await pagoRepository.marcarReembolsoPendiente(client, pago.id, motivo);
  alertar(
    `pago ${pago.id} (compra ${compra.id}) cobrado con ${motivo} (${moneda} ${centavos} centavos): se reembolsa automáticamente`,
  );
  return resultado("procesado", `pago_a_reembolsar:${motivo}`, { reembolsar: [pago.id] });
}

// Función transaccional única de aplicación de un pago de MP: la usan el webhook y la
// reconciliación. Jerarquía de locks: compra -> orden -> pago. Si recibe `refetch`, antes de
// acreditar re-consulta el pago a MP ya con el pago bloqueado, para no actuar sobre un
// estado viejo (p. ej. un refund que llegó entre la notificación y este lock).
async function aplicarPagoMp(
  client: PoolClient,
  original: MpPayment,
  refetch?: Refetch,
): Promise<ResultadoAplicacion> {
  let payment = original;
  const compraId = payment.external_reference;
  if (!compraId || !UUID_RE.test(compraId)) {
    return resultado("ignorado", "external_reference_invalido");
  }
  if (payment.id === undefined || payment.id === null) {
    return resultado("ignorado", "pago_sin_id");
  }

  const compra = await compraRepository.lockById(client, compraId);
  if (!compra) return resultado("ignorado", "compra_inexistente");

  const monedaOk = payment.currency_id === "ARS";
  let montoMp: number | null;
  try {
    montoMp = pesosACentavos(payment.transaction_amount ?? Number.NaN);
  } catch {
    montoMp = null;
  }
  const montoOk =
    montoMp !== null &&
    compra.monto_centavos !== null &&
    toCentavos(compra.monto_centavos) === montoMp;

  if (!monedaOk || !montoOk) {
    const motivo = !monedaOk ? "moneda_invalida" : "monto_invalido";
    if (payment.status === "approved") {
      return registrarCobroInvalido(client, compra, payment, motivo, montoMp);
    }
    if (!monedaOk) return resultado("rechazado", `moneda_invalida:${payment.currency_id}`);
    return resultado("rechazado", montoMp === null ? "monto_invalido" : "monto_distinto_al_esperado");
  }
  const montoCentavos = montoMp as number;
  const mpPaymentId = String(payment.id);

  const orden =
    compra.tipo === "fabricacion"
      ? await ordenFabricacionRepository.lockCerradaPorCompra(client, compra.id)
      : null;

  let pago = await pagoRepository.lockByMpPaymentId(client, mpPaymentId);
  if (pago) {
    if (pago.compra_id !== compra.id || toCentavos(pago.monto_centavos) !== montoCentavos) {
      return resultado("rechazado", "pago_inconsistente_con_la_compra");
    }
  } else {
    pago = await resolverPagoLocal(
      client,
      compra,
      payment,
      montoCentavos,
      mpPaymentId,
      datosMp(payment),
    );
  }

  if (
    refetch &&
    payment.status === "approved" &&
    (pago.estado === "pendiente" || pago.estado === "rechazado")
  ) {
    const fresco = await refetch();
    if (
      fresco.status !== payment.status ||
      fresco.transaction_amount_refunded !== payment.transaction_amount_refunded
    ) {
      payment = {
        ...payment,
        status: fresco.status,
        status_detail: fresco.status_detail,
        transaction_amount_refunded: fresco.transaction_amount_refunded,
      };
    }
  }
  const datos = datosMp(payment);

  let r: ResultadoAplicacion;
  switch (payment.status) {
    case "approved":
      r = await aprobarPago(client, compra, pago, datos, orden);
      break;

    case "rejected":
    case "cancelled":
      if (pago.estado === "pendiente") {
        await pagoRepository.marcarRechazado(client, pago.id, datos);
        r = resultado("procesado", `pago_${payment.status}`);
      } else {
        r = resultado("procesado", "sin_cambios");
      }
      break;

    case "refunded":
    case "charged_back": {
      const status = payment.status;
      if (pago.estado === "aprobado") {
        const { yaPagados } = await aplicarReembolsoLocal(client, compra, pago, null, status);
        r = resultado(
          "procesado",
          yaPagados > 0
            ? `${status}:requiere_revision_manual_payouts_pagados=${yaPagados}`
            : status,
        );
      } else if (pago.estado === "pendiente" || pago.estado === "rechazado") {
        // Devuelto en MP antes de acreditarse acá: queda registrado y no retiene fondos después.
        await registrarReembolsoSinAprobar(client, compra, pago, status);
        r = resultado("procesado", `${status}:sin_retencion`);
      } else {
        r = resultado("procesado", "sin_cambios");
      }
      break;
    }

    default:
      // pending / in_process / authorized / in_mediation: solo se registra el estado de MP.
      if (pago.estado === "pendiente") {
        await pagoRepository.actualizarMpStatus(client, pago.id, datos);
      }
      r = resultado("procesado", `estado_intermedio:${payment.status}`);
  }

  // Refund parcial hecho en MP (el estado sigue 'approved'): el ledger no lo refleja solo.
  const devuelto = payment.transaction_amount_refunded ?? 0;
  if (devuelto > 0 && payment.status !== "refunded" && payment.status !== "charged_back") {
    await pagoRepository.marcarRevisionAdmin(client, pago.id, "refund_parcial_en_mp");
    alertar(
      `el pago ${pago.id} (compra ${compra.id}) tiene un refund parcial en MP (${devuelto}): revisión manual`,
    );
    r = { ...r, detalle: `${r.detalle}:refund_parcial_revision_admin` };
  }
  return r;
}

// Efectos posteriores al commit: reembolsos automáticos y pedido de payouts. Un fallo acá
// nunca revierte lo ya aplicado (los reembolsos pendientes los reintenta el scheduler).
async function completarPostCommit(aplicado: ResultadoAplicacion): Promise<void> {
  for (const pagoId of aplicado.reembolsar) {
    try {
      await pagoService.reembolsar(pagoId, "pago_no_vigente");
    } catch (error) {
      console.error(
        `❌ Reembolso pendiente del pago ${pagoId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  await solicitarPayouts(aplicado.liberados);
}

// Contador de reintentos (503) por pago: estable entre notificaciones del mismo data.id.
function eventoIdReintento(dataId: string): string {
  return `pendiente:${dataId}`;
}

// El evento_id sale solo de campos firmados por MP (data.id y x-request-id); el body y la
// query (type/action) no están firmados y no participan. Se acota a 100 caracteres (columna).
export function construirEventoId(dataId: string | undefined, requestId: string | undefined): string {
  const raw = `mp:${dataId ?? "?"}:${requestId ?? "?"}`;
  return raw.length <= 100
    ? raw
    : `mp:${createHash("sha256").update(raw).digest("hex").slice(0, 60)}`;
}

export const pagoService = {
  // Crea el intento de pago (fila 'pendiente' + preference de Checkout Pro).
  async iniciarPago(
    compraId: string,
    compradorId: string,
  ): Promise<IniciarPagoResultado> {
    const settings = getMercadoPagoSettings();

    const { pago, compra } = await withTransaction(async (client) => {
      const compra = await compraRepository.lockById(client, compraId);
      if (!compra) throw new NotFoundError("Compra no encontrada");
      if (compra.id_comprador !== compradorId) {
        throw new ForbiddenError("No autorizado para pagar esta compra");
      }
      if (compra.estado !== "pendiente_pago") {
        throw new ConflictError("La compra no está pendiente de pago");
      }
      if (compra.monto_centavos === null) {
        throw new ConflictError("La compra todavía no tiene un monto a pagar");
      }
      const monto = toCentavos(compra.monto_centavos);

      let ordenId: string | null = null;
      if (compra.tipo === "fabricacion") {
        const orden = await ordenFabricacionRepository.lockCerradaPorCompra(
          client,
          compra.id,
        );
        if (!orden || orden.estado !== "trato_cerrado") {
          throw new ConflictError(
            "El pago de una fabricación se habilita al cerrarse el trato",
          );
        }
        if (pesosACentavos(orden.precio_acordado) !== monto) {
          throw new ConflictError("El monto de la compra no coincide con el trato");
        }
        ordenId = orden.id;
      }

      const pago = await pagoRepository.crearPendiente(client, {
        compraId: compra.id,
        ordenId,
        montoCentavos: monto,
      });
      return { pago, compra };
    });

    const diseno = await disenoRepository.getById(compra.id_modelo);
    const titulo: string = diseno?.titulo ?? "Diseño 3D";
    const back = (ruta: string) =>
      `${settings.frontendUrl}/pago/${ruta}?compraId=${compra.id}`;

    try {
      const ahora = Date.now();
      const preference = await getMercadoPagoClients().preference.create({
        body: {
          items: [
            {
              id: compra.id_modelo,
              title: titulo.slice(0, 250),
              quantity: 1,
              unit_price: centavosAPesos(toCentavos(pago.monto_centavos)),
              currency_id: "ARS",
            },
          ],
          external_reference: compra.id,
          notification_url: settings.notificationUrl,
          back_urls: {
            success: back("exito"),
            failure: back("error"),
            pending: back("pendiente"),
          },
          auto_return: "approved",
          metadata: { pago_id: pago.id, compra_id: compra.id },
          expires: true,
          expiration_date_from: new Date(ahora).toISOString(),
          expiration_date_to: new Date(ahora + EXPIRACION_PREFERENCE_MS).toISOString(),
        },
        requestOptions: { idempotencyKey: `mec3d-pref-${pago.id}` },
      });

      if (!preference.id || !preference.init_point) {
        throw new Error("Respuesta de preference sin id o init_point");
      }
      await pagoRepository.setPreference(pago.id, preference.id);
      return { pagoId: pago.id, initPoint: preference.init_point };
    } catch (error) {
      console.error(
        "❌ No se pudo crear la preference de Mercado Pago:",
        error instanceof Error ? error.message : error,
      );
      await withTransaction((client) =>
        pagoRepository.marcarRechazado(client, pago.id, {
          mpStatus: "preference_error",
          mpStatusDetail: null,
          raw: {},
        }),
      );
      throw new AppError("No se pudo iniciar el pago, intente nuevamente", 502);
    }
  },

  async getEstadoPago(
    compraId: string,
    userId: string,
  ): Promise<EstadoPagoResponse> {
    const compra = await compraRepository.getById(compraId);
    if (!compra) throw new NotFoundError("Compra no encontrada");
    if (compra.id_comprador !== userId) {
      throw new ForbiddenError("No autorizado para consultar esta compra");
    }
    const pago = await pagoRepository.getUltimoPorCompra(compra.id);
    return {
      compraId: compra.id,
      tipo: compra.tipo,
      estadoCompra: compra.estado,
      montoCentavos:
        compra.monto_centavos === null ? null : toCentavos(compra.monto_centavos),
      moneda: compra.moneda,
      pago: pago ? mapPagoResumen(pago) : null,
    };
  },

  // Webhook de MP: la notificación solo avisa que algo cambió; el estado real se
  // re-consulta a la API de MP por id y es lo único que se usa para decidir.
  async procesarWebhook(req: WebhookRequest): Promise<WebhookResponse> {
    const { webhookSecret } = getMercadoPagoSettings();

    const queryParsed = webhookQuerySchema.safeParse(req.query ?? {});
    const bodyParsed = webhookNotificationSchema.safeParse(req.body ?? {});
    const q = queryParsed.success ? queryParsed.data : {};
    const b = bodyParsed.success ? bodyParsed.data : {};

    const dataId =
      q["data.id"] ?? (b.data?.id !== undefined ? String(b.data.id) : undefined);

    const firma = verificarFirmaMercadoPago({
      xSignature: req.xSignature,
      xRequestId: req.xRequestId,
      dataId,
      secret: webhookSecret,
    });
    if (!firma.valida) {
      console.warn(`⚠️  Webhook de Mercado Pago rechazado: ${firma.motivo}`);
      return { httpStatus: 401, resultado: "firma_invalida" };
    }

    const tipo = q.type ?? q.topic ?? b.type ?? b.topic ?? null;
    const evento: NuevoWebhookEvento = {
      eventoId: construirEventoId(dataId, req.xRequestId),
      tipo,
      accion: b.action ?? null,
      dataId: dataId ?? null,
      requestId: req.xRequestId ?? null,
      payload: req.body,
    };

    if (tipo !== "payment" || !dataId || !/^\d{1,20}$/.test(dataId)) {
      await withTransaction(async (client) => {
        const id = await webhookEventoRepository.registrar(client, evento);
        if (id) {
          await webhookEventoRepository.resolver(client, id, "ignorado", "tipo_no_soportado");
        }
      });
      return { httpStatus: 200, resultado: "ignorado" };
    }

    // Se consulta antes de abrir la transacción: no se retienen locks durante la llamada de red.
    // Un error de red/5xx se propaga (500) y MP reintenta la notificación.
    let payment: MpPayment;
    try {
      payment = (await getMercadoPagoClients().payment.get({
        id: dataId,
      })) as MpPayment;
    } catch (error) {
      if ((error as { status?: number } | null)?.status !== 404) throw error;
      return this.registrarPagoNoDisponible(evento, dataId);
    }

    const refetch: Refetch = async () =>
      (await getMercadoPagoClients().payment.get({ id: dataId })) as MpPayment;

    const aplicado = await withTransaction(async (client) => {
      const eventoId = await webhookEventoRepository.registrar(client, evento);
      if (!eventoId) return null;
      const r = await aplicarPagoMp(client, payment, refetch);
      await webhookEventoRepository.resolver(client, eventoId, r.estado, r.detalle);
      // Si antes MP no exponía este pago (404), el contador de reintentos ya no aplica.
      await webhookEventoRepository.cerrarReintentos(client, eventoIdReintento(dataId));
      return r;
    });

    if (!aplicado) return { httpStatus: 200, resultado: "duplicado" };

    await completarPostCommit(aplicado);
    return { httpStatus: 200, resultado: aplicado.estado };
  },

  // MP todavía no expone el pago (404): no se cierra el evento; se responde 503 para que MP
  // reintente. El contador es por data.id (no por request-id) así los reintentos nunca caen en
  // 'duplicado'; pasado MAX_REINTENTOS_WEBHOOK se da por ignorado (ej. id de prueba del panel de MP).
  async registrarPagoNoDisponible(
    evento: NuevoWebhookEvento,
    dataId: string,
  ): Promise<WebhookResponse> {
    const reintento = await withTransaction((client) =>
      webhookEventoRepository.registrarReintento(client, {
        ...evento,
        eventoId: eventoIdReintento(dataId),
      }),
    );
    // null: el contador de este pago ya se resolvió (agotado o procesado).
    if (!reintento) return { httpStatus: 200, resultado: "ignorado" };

    if (reintento.intentos > MAX_REINTENTOS_WEBHOOK) {
      await withTransaction((client) =>
        webhookEventoRepository.agotarReintentos(client, reintento.id, "reintentos_agotados"),
      );
      console.warn(
        `⚠️  Webhook del pago ${dataId}: sin disponibilidad en MP tras ${MAX_REINTENTOS_WEBHOOK} reintentos, se descarta`,
      );
      return { httpStatus: 200, resultado: "ignorado" };
    }
    return { httpStatus: 503, resultado: "reintentable" };
  },

  // Compras 'pendiente_pago' con preference reciente: se consulta a MP por external_reference
  // (por si se perdió el webhook) y se acreditan los pagos aprobados con la misma función
  // transaccional que usa el webhook (aplicarPagoMp). Idempotente.
  async reconciliarPagosPendientes(limite = 50): Promise<ResumenReconciliacion> {
    const compraIds = await pagoRepository.listarComprasParaReconciliar(limite);
    const { payment } = getMercadoPagoClients();
    const resumen: ResumenReconciliacion = { revisadas: compraIds.length, acreditados: 0, errores: 0 };

    for (const compraId of compraIds) {
      try {
        const busqueda = await payment.search({
          options: {
            external_reference: compraId,
            status: "approved",
            sort: "date_created",
            criteria: "desc",
            limit: 10,
          },
        });
        for (const encontrado of busqueda.results ?? []) {
          if (encontrado.id === undefined || encontrado.id === null) continue;
          const completo = (await payment.get({ id: String(encontrado.id) })) as MpPayment;
          const aplicado = await withTransaction((client) => aplicarPagoMp(client, completo));
          await completarPostCommit(aplicado);
          if (aplicado.detalle.startsWith("pago_aprobado")) resumen.acreditados++;
        }
      } catch (error) {
        resumen.errores++;
        console.error(
          `❌ Reconciliación de la compra ${compraId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    return resumen;
  },

  // Fondos retenidos -> pendiente_payout (vendedores) / liberado (plataforma). Corre dentro
  // de la transacción de cierre de la orden, con la compra ya bloqueada.
  async liberarRetenidos(
    client: PoolClient,
    compraId: string,
  ): Promise<MovimientoRow[]> {
    const pago = await pagoRepository.lockAprobadoPrincipalPorCompra(client, compraId);
    if (!pago) {
      throw new ConflictError("No hay un pago aprobado con fondos retenidos");
    }
    const liberados = await movimientoRepository.liberarPorPago(client, pago.id);
    if (liberados.length === 0) {
      throw new ConflictError("Los fondos de esta compra ya fueron liberados");
    }
    return liberados;
  },

  // Devuelve el pago completo en MP y lo refleja en el ledger. Reintentable: la intención
  // queda persistida (reembolso_pendiente) antes de llamar a MP, la llamada usa una
  // idempotency key estable y el cierre local es idempotente. `yaPagados` = payouts ya
  // transferidos que el reembolso no puede revertir (queda auditado en pagos y en el log).
  async reembolsarConDetalle(
    pagoId: string,
    motivo = "reembolso_solicitado",
  ): Promise<{ resultado: Exclude<ResultadoReembolso, "no_aplica">; yaPagados: number }> {
    const inicial = await withTransaction(async (client) => {
      const pago = await pagoRepository.lockById(client, pagoId);
      if (!pago) throw new NotFoundError("Pago no encontrado");
      if (pago.estado === "reembolsado") return pago;
      if (pago.estado !== "aprobado" || !pago.mp_payment_id) {
        throw new ConflictError("Solo se puede reembolsar un pago aprobado");
      }
      if (!pago.reembolso_pendiente) {
        await pagoRepository.marcarReembolsoPendiente(client, pagoId, motivo);
      }
      return pago;
    });
    if (inicial.estado === "reembolsado") {
      return { resultado: "reembolsado", yaPagados: inicial.payouts_pagados_al_reembolsar ?? 0 };
    }

    const mpPaymentId = inicial.mp_payment_id as string;
    const { refund, payment } = getMercadoPagoClients();
    let refundId: string | null = null;

    try {
      const respuesta = await refund.total({
        payment_id: mpPaymentId,
        requestOptions: { idempotencyKey: `mec3d-refund-${pagoId}` },
      });
      refundId = respuesta.id !== undefined ? String(respuesta.id) : null;
    } catch (error) {
      // Puede estar ya reembolsado (intento previo cuya respuesta se perdió, o desde el panel de MP).
      const actual = (await payment
        .get({ id: mpPaymentId })
        .catch(() => null)) as MpPayment | null;
      if (actual?.status !== "refunded") {
        console.error(
          `❌ Refund de MP falló para el pago ${pagoId} (queda reembolso_pendiente):`,
          error instanceof Error ? error.message : error,
        );
        return { resultado: "pendiente", yaPagados: 0 };
      }
    }

    const yaPagados = await withTransaction(async (client) => {
      const fila = await pagoRepository.getById(pagoId, client);
      if (!fila) throw new NotFoundError("Pago no encontrado");
      const compra = await compraRepository.lockById(client, fila.compra_id);
      const pago = await pagoRepository.lockById(client, pagoId);
      if (!compra || !pago || pago.estado !== "aprobado") return 0;
      return (await aplicarReembolsoLocal(client, compra, pago, refundId, "refunded")).yaPagados;
    });
    return { resultado: "reembolsado", yaPagados };
  },

  async reembolsar(
    pagoId: string,
    motivo = "reembolso_solicitado",
  ): Promise<Exclude<ResultadoReembolso, "no_aplica">> {
    return (await this.reembolsarConDetalle(pagoId, motivo)).resultado;
  },

  async reintentarReembolsosPendientes(limite = 50): Promise<{
    intentados: number;
    reembolsados: number;
    pendientes: number;
    conPayoutsPagados: number;
  }> {
    const pagos = await pagoRepository.listarReembolsosPendientes(limite);
    let reembolsados = 0;
    let conPayoutsPagados = 0;
    for (const pago of pagos) {
      try {
        const { resultado, yaPagados } = await this.reembolsarConDetalle(pago.id);
        if (resultado === "reembolsado") reembolsados++;
        if (yaPagados > 0) conPayoutsPagados++;
      } catch (error) {
        console.error(
          `❌ Reintento de reembolso del pago ${pago.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    return {
      intentados: pagos.length,
      reembolsados,
      pendientes: pagos.length - reembolsados,
      conPayoutsPagados,
    };
  },
};
