import crypto from "crypto";

// ── Mocks: nada toca la DB ni la red (SDK de Mercado Pago incluido) ───────────
const mockPaymentGet = jest.fn();
const mockRefundTotal = jest.fn();
const mockPreferenceCreate = jest.fn();
const mockClient = { query: jest.fn() };

jest.mock("../src/config/mercadopago.config", () => ({
  getMercadoPagoClients: () => ({
    payment: { get: mockPaymentGet },
    refund: { total: mockRefundTotal },
    preference: { create: mockPreferenceCreate },
  }),
}));
jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: (fn: (c: unknown) => Promise<unknown>) => fn(mockClient),
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: {
    lockById: jest.fn(),
    getById: jest.fn(),
    marcarPagada: jest.fn(),
    completar: jest.fn(),
    marcarReembolsada: jest.fn(),
  },
}));
jest.mock("../src/repositories/comision.repository", () => ({
  comisionRepository: { getConfig: jest.fn() },
}));
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: { getById: jest.fn() },
}));
jest.mock("../src/repositories/orden-fabricacion.repository", () => ({
  ordenFabricacionRepository: {
    lockCerradaPorCompra: jest.fn(),
    cancelarCerradaPorCompra: jest.fn(),
  },
}));
jest.mock("../src/repositories/pago.repository", () => ({
  pagoRepository: {
    lockById: jest.fn(),
    getById: jest.fn(),
    lockByMpPaymentId: jest.fn(),
    asignarMpPayment: jest.fn(),
    insertarDesdeMp: jest.fn(),
    marcarAprobado: jest.fn(),
    marcarRechazado: jest.fn(),
    marcarReembolsoPendiente: jest.fn(),
    marcarReembolsado: jest.fn(),
    marcarReembolsadoSinAprobar: jest.fn(),
    marcarRevisionAdmin: jest.fn(),
    actualizarMpStatus: jest.fn(),
  },
}));
jest.mock("../src/repositories/movimiento.repository", () => ({
  movimientoRepository: {
    insertar: jest.fn(),
    sumaDesglose: jest.fn(),
    liberarPorPago: jest.fn(),
    existeRetencion: jest.fn(),
    reembolsarPorPago: jest.fn(),
    insertarReembolso: jest.fn(),
  },
}));
jest.mock("../src/repositories/webhook-evento.repository", () => ({
  webhookEventoRepository: {
    registrar: jest.fn(),
    resolver: jest.fn(),
    registrarReintento: jest.fn(),
    agotarReintentos: jest.fn(),
    cerrarReintentos: jest.fn(),
  },
}));
jest.mock("../src/services/payout.provider", () => ({
  solicitarPayouts: jest.fn(),
}));

import { pagoService, MAX_REINTENTOS_WEBHOOK } from "../src/services/pago.service";
import { getPayoutHoldDays } from "../src/utils/policy.util";
import { compraRepository } from "../src/repositories/compra.repository";
import { comisionRepository } from "../src/repositories/comision.repository";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { pagoRepository } from "../src/repositories/pago.repository";
import { movimientoRepository } from "../src/repositories/movimiento.repository";
import { webhookEventoRepository } from "../src/repositories/webhook-evento.repository";
import { solicitarPayouts } from "../src/services/payout.provider";

const mk = (fn: unknown) => fn as jest.Mock;

const SECRET = "secreto-webhook-de-prueba";
const COMPRA_ID = "11111111-1111-4111-8111-111111111111";
const PAGO_ID = "22222222-2222-4222-8222-222222222222";
const ORDEN_ID = "33333333-3333-4333-8333-333333333333";
const DISENADOR_ID = "44444444-4444-4444-8444-444444444444";
const FABRICANTE_ID = "55555555-5555-4555-8555-555555555555";
const COMPRADOR_ID = "66666666-6666-4666-8666-666666666666";
const MP_ID = "987654321";

const compraBase = {
  id: COMPRA_ID,
  id_comprador: COMPRADOR_ID,
  id_modelo: "77777777-7777-4777-8777-777777777777",
  id_disenador: DISENADOR_ID,
  tipo: "descarga",
  estado: "pendiente_pago",
  monto_centavos: "250000",
  moneda: "ARS",
};

const pagoBase = {
  id: PAGO_ID,
  compra_id: COMPRA_ID,
  orden_id: null,
  mp_payment_id: null,
  estado: "pendiente",
  monto_centavos: "250000",
  moneda: "ARS",
  reembolso_pendiente: false,
};

function mpPayment(over: Record<string, unknown> = {}) {
  return {
    id: Number(MP_ID),
    status: "approved",
    currency_id: "ARS",
    transaction_amount: 2500,
    external_reference: COMPRA_ID,
    metadata: { pago_id: PAGO_ID },
    // Datos sensibles que nunca deben persistirse.
    payer: { email: "comprador@example.com" },
    card: { last_four_digits: "1234" },
    ...over,
  };
}

function firmar(dataId: string, requestId: string) {
  const ts = Date.now();
  const v1 = crypto
    .createHmac("sha256", SECRET)
    .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  return `ts=${ts},v1=${v1}`;
}

function webhook(over: { dataId?: string; type?: string; xSignature?: string; body?: unknown } = {}) {
  const dataId = over.dataId ?? MP_ID;
  const type = over.type ?? "payment";
  return {
    query: { "data.id": dataId, type },
    body: over.body ?? { id: 555, type, action: "payment.updated", data: { id: dataId } },
    xSignature: over.xSignature ?? firmar(dataId, "req-1"),
    xRequestId: "req-1",
  };
}

beforeAll(() => {
  process.env.MP_ACCESS_TOKEN = "TEST-token";
  process.env.MP_WEBHOOK_SECRET = SECRET;
  process.env.MP_NOTIFICATION_URL = "https://api.example.com/api/v1/webhooks/mercadopago";
  process.env.FRONTEND_URL = "https://front.example.com";
});

let insertados: { tipo: string; montoCentavos: number; estado: string; usuarioId: string | null }[];

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  insertados = [];

  mk(webhookEventoRepository.registrar).mockResolvedValue("evento-1");
  mk(webhookEventoRepository.cerrarReintentos).mockResolvedValue(undefined);
  mk(pagoRepository.insertarDesdeMp).mockImplementation(async (_c, p) => ({
    ...pagoBase,
    id: PAGO_ID,
    mp_payment_id: p.mpPaymentId,
    monto_centavos: String(p.montoCentavos),
    moneda: p.moneda,
  }));
  mk(compraRepository.lockById).mockResolvedValue({ ...compraBase });
  mk(comisionRepository.getConfig).mockResolvedValue({ plataformaBps: 1000, regaliaDisenadorBps: 300 });
  mk(ordenFabricacionRepository.lockCerradaPorCompra).mockResolvedValue(null);
  mk(pagoRepository.lockByMpPaymentId).mockResolvedValue(null);
  mk(pagoRepository.lockById).mockResolvedValue({ ...pagoBase });
  mk(pagoRepository.asignarMpPayment).mockResolvedValue(true);
  mk(pagoRepository.marcarAprobado).mockResolvedValue(true);
  mk(compraRepository.marcarPagada).mockResolvedValue(true);
  mk(compraRepository.completar).mockResolvedValue(true);
  mk(movimientoRepository.insertar).mockImplementation(async (_c, mov) => {
    insertados.push(mov);
    return true;
  });
  mk(movimientoRepository.sumaDesglose).mockImplementation(async () =>
    insertados.filter((m) => m.tipo !== "retencion").reduce((s, m) => s + m.montoCentavos, 0),
  );
  mk(movimientoRepository.liberarPorPago).mockResolvedValue([{ id: "mov-1", usuario_id: DISENADOR_ID }]);
  mk(mockPaymentGet).mockResolvedValue(mpPayment());
});

const resuelto = () => mk(webhookEventoRepository.resolver).mock.calls[0]?.slice(2);

// Deja listo el flujo post-commit de reembolso: el pago figura aprobado y MP acepta el refund.
function prepararReembolso() {
  const aprobado = { ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" };
  mk(pagoRepository.lockById).mockResolvedValue(aprobado);
  mk(pagoRepository.getById).mockResolvedValue(aprobado);
  mk(pagoRepository.marcarReembolsado).mockResolvedValue(true);
  mk(movimientoRepository.existeRetencion).mockResolvedValue(false);
  mk(movimientoRepository.reembolsarPorPago).mockResolvedValue({ revertidos: 0, yaPagados: 0 });
  mockRefundTotal.mockResolvedValue({ id: 31 });
}

describe("procesarWebhook: autenticidad", () => {
  it("firma inválida => 401, sin consultar a MP ni escribir nada", async () => {
    const r = await pagoService.procesarWebhook(webhook({ xSignature: "ts=1,v1=00" }));
    expect(r).toEqual({ httpStatus: 401, resultado: "firma_invalida" });
    expect(mockPaymentGet).not.toHaveBeenCalled();
    expect(webhookEventoRepository.registrar).not.toHaveBeenCalled();
  });

  it("firma auténtica pero vieja => 401", async () => {
    const dataId = MP_ID;
    const ts = Date.now() - 10 * 60 * 1000;
    const v1 = crypto
      .createHmac("sha256", SECRET)
      .update(`id:${dataId};request-id:req-1;ts:${ts};`)
      .digest("hex");
    const r = await pagoService.procesarWebhook(webhook({ xSignature: `ts=${ts},v1=${v1}` }));
    expect(r.httpStatus).toBe(401);
    expect(mockPaymentGet).not.toHaveBeenCalled();
  });

  it("tipo distinto de payment => 200 ignorado sin consultar a MP", async () => {
    const r = await pagoService.procesarWebhook(webhook({ type: "merchant_order" }));
    expect(r).toEqual({ httpStatus: 200, resultado: "ignorado" });
    expect(mockPaymentGet).not.toHaveBeenCalled();
    expect(resuelto()).toEqual(["ignorado", "tipo_no_soportado"]);
  });

  describe("pago inexistente en MP (404)", () => {
    beforeEach(() => {
      mockPaymentGet.mockRejectedValue({ status: 404, message: "not found" });
    });

    it("=> 503 reintentable, con contador por data.id y sin cerrar el evento", async () => {
      mk(webhookEventoRepository.registrarReintento).mockResolvedValue({ id: "ev-r", intentos: 1 });
      const r = await pagoService.procesarWebhook(webhook());
      expect(r).toEqual({ httpStatus: 503, resultado: "reintentable" });
      expect(webhookEventoRepository.registrarReintento).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ eventoId: `pendiente:${MP_ID}`, dataId: MP_ID }),
      );
      expect(webhookEventoRepository.registrar).not.toHaveBeenCalled();
      expect(webhookEventoRepository.resolver).not.toHaveBeenCalled();
      expect(webhookEventoRepository.agotarReintentos).not.toHaveBeenCalled();
    });

    it("sigue en 503 hasta el máximo de reintentos", async () => {
      mk(webhookEventoRepository.registrarReintento).mockResolvedValue({
        id: "ev-r",
        intentos: MAX_REINTENTOS_WEBHOOK,
      });
      const r = await pagoService.procesarWebhook(webhook());
      expect(r.httpStatus).toBe(503);
      expect(webhookEventoRepository.agotarReintentos).not.toHaveBeenCalled();
    });

    it("superado el máximo de reintentos => 200 ignorado y se agota el contador", async () => {
      mk(webhookEventoRepository.registrarReintento).mockResolvedValue({
        id: "ev-r",
        intentos: MAX_REINTENTOS_WEBHOOK + 1,
      });
      const r = await pagoService.procesarWebhook(webhook());
      expect(r).toEqual({ httpStatus: 200, resultado: "ignorado" });
      expect(webhookEventoRepository.agotarReintentos).toHaveBeenCalledWith(
        mockClient,
        "ev-r",
        "reintentos_agotados",
      );
    });

    it("contador ya resuelto (null) => 200 ignorado sin más efectos", async () => {
      mk(webhookEventoRepository.registrarReintento).mockResolvedValue(null);
      const r = await pagoService.procesarWebhook(webhook());
      expect(r).toEqual({ httpStatus: 200, resultado: "ignorado" });
      expect(webhookEventoRepository.agotarReintentos).not.toHaveBeenCalled();
    });
  });

  it("un error de red de MP se propaga (500) para que MP reintente", async () => {
    mockPaymentGet.mockRejectedValue(new Error("timeout"));
    await expect(pagoService.procesarWebhook(webhook())).rejects.toThrow("timeout");
    expect(webhookEventoRepository.registrar).not.toHaveBeenCalled();
    expect(webhookEventoRepository.registrarReintento).not.toHaveBeenCalled();
  });

  it("el evento_id sale solo de data.id y x-request-id firmados, no del body ni de la query", async () => {
    await pagoService.procesarWebhook(webhook());
    insertados.length = 0;
    await pagoService.procesarWebhook(
      webhook({ body: { id: 999, type: "payment", action: "otra.accion", data: { id: MP_ID } } }),
    );
    const ids = mk(webhookEventoRepository.registrar).mock.calls.map((c) => c[1].eventoId);
    expect(ids).toEqual([`mp:${MP_ID}:req-1`, `mp:${MP_ID}:req-1`]);
  });
});

describe("procesarWebhook: idempotencia", () => {
  it("evento ya registrado => 200 duplicado sin efectos", async () => {
    mk(webhookEventoRepository.registrar).mockResolvedValue(null);
    const r = await pagoService.procesarWebhook(webhook());
    expect(r).toEqual({ httpStatus: 200, resultado: "duplicado" });
    expect(compraRepository.lockById).not.toHaveBeenCalled();
    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
  });

  it("pago ya aprobado (otra notificación del mismo pago) no duplica el ledger", async () => {
    mk(pagoRepository.lockByMpPaymentId).mockResolvedValue({ ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" });
    const r = await pagoService.procesarWebhook(webhook());
    expect(r.resultado).toBe("procesado");
    expect(resuelto()).toEqual(["procesado", "pago_ya_procesado"]);
    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
    expect(compraRepository.marcarPagada).not.toHaveBeenCalled();
    expect(webhookEventoRepository.cerrarReintentos).toHaveBeenCalledWith(mockClient, `pendiente:${MP_ID}`);
    // Pago ya acreditado: no hace falta re-consultar a MP.
    expect(mockPaymentGet).toHaveBeenCalledTimes(1);
  });
});

describe("procesarWebhook: validación del pago re-consultado", () => {
  it("consulta el pago por el data.id firmado, no por lo que diga el body", async () => {
    await pagoService.procesarWebhook(webhook({ body: { id: 1, type: "payment", data: { id: "111" } } }));
    expect(mockPaymentGet).toHaveBeenCalledWith({ id: MP_ID });
  });

  it.each([
    ["moneda distinta de ARS", { currency_id: "USD" }, "moneda_invalida:USD"],
    ["monto distinto al de la compra", { transaction_amount: 1 }, "monto_distinto_al_esperado"],
    ["monto con más de 2 decimales", { transaction_amount: 2500.001 }, "monto_invalido"],
  ])("rechaza %s (pago no aprobado)", async (_n, over, detalle) => {
    mockPaymentGet.mockResolvedValue(mpPayment({ ...over, status: "pending" }));
    const r = await pagoService.procesarWebhook(webhook());
    expect(r).toEqual({ httpStatus: 200, resultado: "rechazado" });
    expect(resuelto()).toEqual(["rechazado", detalle]);
    expect(pagoRepository.marcarAprobado).not.toHaveBeenCalled();
    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
  });

  // Cobro aprobado en MP con moneda/monto que no corresponden: nunca acredita; se devuelve.
  it.each([
    ["moneda distinta de ARS", { currency_id: "USD" }, "moneda_invalida", "USD", 250_000],
    ["monto distinto al de la compra", { transaction_amount: 1 }, "monto_invalido", "ARS", 100],
    ["monto con más de 2 decimales", { transaction_amount: 2500.001 }, "monto_invalido", "ARS", 250_000],
  ])(
    "%s aprobado => no acredita y se marca para reembolso",
    async (_n, over, motivo, moneda, centavos) => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      prepararReembolso();
      mockPaymentGet.mockResolvedValue(mpPayment(over));

      const r = await pagoService.procesarWebhook(webhook());

      expect(r).toEqual({ httpStatus: 200, resultado: "procesado" });
      expect(resuelto()).toEqual(["procesado", `pago_a_reembolsar:${motivo}`]);
      expect(pagoRepository.insertarDesdeMp).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ moneda, montoCentavos: centavos, mpPaymentId: MP_ID }),
      );
      expect(pagoRepository.marcarReembolsoPendiente).toHaveBeenCalledWith(mockClient, PAGO_ID, motivo);
      expect(compraRepository.marcarPagada).not.toHaveBeenCalled();
      expect(movimientoRepository.insertar).not.toHaveBeenCalled();
      expect(mockRefundTotal).toHaveBeenCalledWith(expect.objectContaining({ payment_id: MP_ID }));
    },
  );

  it("cobro inválido con moneda ilegible no se registra (alerta manual)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockPaymentGet.mockResolvedValue(mpPayment({ currency_id: undefined }));
    const r = await pagoService.procesarWebhook(webhook());
    expect(r.resultado).toBe("rechazado");
    expect(resuelto()).toEqual(["rechazado", "moneda_invalida:no_registrable"]);
    expect(pagoRepository.insertarDesdeMp).not.toHaveBeenCalled();
    expect(pagoRepository.marcarAprobado).not.toHaveBeenCalled();
  });

  it("re-consulta bajo lock: un refund llegado tras la notificación impide acreditar", async () => {
    mockPaymentGet
      .mockResolvedValueOnce(mpPayment())
      .mockResolvedValueOnce(mpPayment({ status: "refunded" }));
    mk(pagoRepository.marcarReembolsadoSinAprobar).mockResolvedValue(true);

    const r = await pagoService.procesarWebhook(webhook());

    expect(mockPaymentGet).toHaveBeenCalledTimes(2);
    expect(r.resultado).toBe("procesado");
    expect(resuelto()).toEqual(["procesado", "refunded:sin_retencion"]);
    expect(pagoRepository.marcarAprobado).not.toHaveBeenCalled();
    expect(compraRepository.marcarPagada).not.toHaveBeenCalled();
    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
    expect(movimientoRepository.insertarReembolso).toHaveBeenCalledTimes(1);
  });

  it("re-consulta bajo lock: si el estado sigue aprobado, acredita normalmente", async () => {
    const r = await pagoService.procesarWebhook(webhook());
    expect(mockPaymentGet).toHaveBeenCalledTimes(2);
    expect(r.resultado).toBe("procesado");
    expect(compraRepository.marcarPagada).toHaveBeenCalledWith(mockClient, COMPRA_ID);
  });

  it("refund parcial en MP => revisión admin, sin tocar el ledger", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mk(pagoRepository.lockByMpPaymentId).mockResolvedValue({ ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" });
    mockPaymentGet.mockResolvedValue(mpPayment({ transaction_amount_refunded: 100 }));
    await pagoService.procesarWebhook(webhook());
    expect(pagoRepository.marcarRevisionAdmin).toHaveBeenCalledWith(mockClient, PAGO_ID, "refund_parcial_en_mp");
    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
    expect(resuelto()).toEqual(["procesado", "pago_ya_procesado:refund_parcial_revision_admin"]);
  });

  it("ignora external_reference inválido o compra inexistente", async () => {
    mockPaymentGet.mockResolvedValue(mpPayment({ external_reference: "no-es-uuid" }));
    expect((await pagoService.procesarWebhook(webhook())).resultado).toBe("ignorado");

    jest.mocked(webhookEventoRepository.registrar).mockResolvedValue("evento-2");
    mockPaymentGet.mockResolvedValue(mpPayment());
    mk(compraRepository.lockById).mockResolvedValue(null);
    const r = await pagoService.procesarWebhook(webhook());
    expect(r.resultado).toBe("ignorado");
  });

  it("rechaza un pago de MP ya vinculado a otra compra", async () => {
    mk(pagoRepository.lockByMpPaymentId).mockResolvedValue({
      ...pagoBase,
      compra_id: "99999999-9999-4999-8999-999999999999",
      mp_payment_id: MP_ID,
    });
    const r = await pagoService.procesarWebhook(webhook());
    expect(r.resultado).toBe("rechazado");
    expect(resuelto()).toEqual(["rechazado", "pago_inconsistente_con_la_compra"]);
  });
});

describe("procesarWebhook: pago aprobado", () => {
  it("descarga: compra pagada + ledger completo + liberación inmediata + compra completada", async () => {
    const r = await pagoService.procesarWebhook(webhook());

    expect(r).toEqual({ httpStatus: 200, resultado: "procesado" });
    expect(pagoRepository.asignarMpPayment).toHaveBeenCalledWith(mockClient, PAGO_ID, MP_ID, expect.anything());
    expect(pagoRepository.marcarAprobado).toHaveBeenCalled();
    expect(compraRepository.marcarPagada).toHaveBeenCalledWith(mockClient, COMPRA_ID);

    const porTipo = Object.fromEntries(insertados.map((m) => [m.tipo, m]));
    expect(porTipo.retencion.montoCentavos).toBe(250_000);
    expect(porTipo.comision_plataforma).toMatchObject({ montoCentavos: 25_000, usuarioId: null });
    expect(porTipo.pago_disenador).toMatchObject({ montoCentavos: 225_000, usuarioId: DISENADOR_ID });

    expect(movimientoRepository.liberarPorPago).toHaveBeenCalledWith(mockClient, PAGO_ID, getPayoutHoldDays());
    expect(compraRepository.completar).toHaveBeenCalledWith(mockClient, COMPRA_ID, { entrega: false });
    expect(solicitarPayouts).toHaveBeenCalledWith([{ id: "mov-1", usuario_id: DISENADOR_ID }]);
    expect(resuelto()).toEqual(["procesado", "pago_aprobado_liberado"]);
  });

  it("no persiste datos del pagador ni de la tarjeta", async () => {
    await pagoService.procesarWebhook(webhook());
    const datos = mk(pagoRepository.marcarAprobado).mock.calls[0][2];
    expect(JSON.stringify(datos)).not.toMatch(/payer|card|comprador@example/);
  });

  it("fabricación: ledger con el split 10 / 2,7 / 87,3 y fondos RETENIDOS (sin liberar ni completar)", async () => {
    mk(compraRepository.lockById).mockResolvedValue({
      ...compraBase,
      tipo: "fabricacion",
      monto_centavos: "1000000",
    });
    mk(ordenFabricacionRepository.lockCerradaPorCompra).mockResolvedValue({
      id: ORDEN_ID,
      estado: "trato_cerrado",
      fabricante_id: FABRICANTE_ID,
    });
    mk(pagoRepository.lockById).mockResolvedValue({ ...pagoBase, monto_centavos: "1000000", orden_id: ORDEN_ID });
    mockPaymentGet.mockResolvedValue(mpPayment({ transaction_amount: 10000 }));

    const r = await pagoService.procesarWebhook(webhook());

    expect(r.resultado).toBe("procesado");
    const porTipo = Object.fromEntries(insertados.map((m) => [m.tipo, m]));
    expect(porTipo.comision_plataforma.montoCentavos).toBe(100_000);
    expect(porTipo.regalia_disenador).toMatchObject({ montoCentavos: 27_000, usuarioId: DISENADOR_ID });
    expect(porTipo.pago_fabricante).toMatchObject({ montoCentavos: 873_000, usuarioId: FABRICANTE_ID });
    expect(insertados.every((m) => m.estado === "retenido")).toBe(true);
    expect(movimientoRepository.liberarPorPago).not.toHaveBeenCalled();
    expect(compraRepository.completar).not.toHaveBeenCalled();
    expect(solicitarPayouts).toHaveBeenCalledWith([]);
    expect(resuelto()).toEqual(["procesado", "pago_aprobado_retenido"]);
  });

  it("la invariante del ledger se verifica: si el desglose no cierra, se aborta (rollback)", async () => {
    mk(movimientoRepository.sumaDesglose).mockResolvedValue(1);
    await expect(pagoService.procesarWebhook(webhook())).rejects.toThrow("Invariante del ledger violada");
    expect(webhookEventoRepository.resolver).not.toHaveBeenCalled();
  });

  it("compra ya cancelada: el pago se marca para reembolso y se devuelve en MP", async () => {
    mk(compraRepository.lockById).mockResolvedValue({ ...compraBase, estado: "cancelada" });
    // 1ª lectura (vínculo por metadata.pago_id): pendiente; después (reembolsar): ya aprobado.
    mk(pagoRepository.lockById)
      .mockResolvedValueOnce({ ...pagoBase })
      .mockImplementation(async (_c, id) => ({
        ...pagoBase,
        id,
        mp_payment_id: MP_ID,
        estado: "aprobado",
      }));
    mockRefundTotal.mockResolvedValue({ id: 31 });
    mk(pagoRepository.getById).mockResolvedValue({ ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" });
    mk(pagoRepository.marcarReembolsado).mockResolvedValue(true);
    mk(movimientoRepository.existeRetencion).mockResolvedValue(false);
    mk(movimientoRepository.reembolsarPorPago).mockResolvedValue({ revertidos: 0, yaPagados: 0 });

    await pagoService.procesarWebhook(webhook());

    expect(movimientoRepository.insertar).not.toHaveBeenCalled();
    expect(compraRepository.marcarPagada).not.toHaveBeenCalled();
    expect(pagoRepository.marcarReembolsoPendiente).toHaveBeenCalledWith(mockClient, PAGO_ID, "compra_cancelada");
    expect(mockRefundTotal).toHaveBeenCalledWith({
      payment_id: MP_ID,
      requestOptions: { idempotencyKey: `mec3d-refund-${PAGO_ID}` },
    });
  });
});

describe("procesarWebhook: otros estados de MP", () => {
  it.each(["rejected", "cancelled"])("%s marca el pago pendiente como rechazado", async (status) => {
    mockPaymentGet.mockResolvedValue(mpPayment({ status }));
    await pagoService.procesarWebhook(webhook());
    expect(pagoRepository.marcarRechazado).toHaveBeenCalled();
    expect(compraRepository.marcarPagada).not.toHaveBeenCalled();
    expect(resuelto()).toEqual(["procesado", `pago_${status}`]);
  });

  it("in_process solo registra el estado intermedio", async () => {
    mockPaymentGet.mockResolvedValue(mpPayment({ status: "in_process" }));
    await pagoService.procesarWebhook(webhook());
    expect(pagoRepository.actualizarMpStatus).toHaveBeenCalled();
    expect(pagoRepository.marcarAprobado).not.toHaveBeenCalled();
  });

  it.each(["refunded", "charged_back"])("%s revierte ledger y compra de un pago aprobado", async (status) => {
    mk(pagoRepository.lockByMpPaymentId).mockResolvedValue({ ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" });
    mk(pagoRepository.marcarReembolsado).mockResolvedValue(true);
    mk(movimientoRepository.existeRetencion).mockResolvedValue(true);
    mk(movimientoRepository.reembolsarPorPago).mockResolvedValue({ revertidos: 3, yaPagados: 0 });
    mk(compraRepository.marcarReembolsada).mockResolvedValue(true);
    mk(ordenFabricacionRepository.cancelarCerradaPorCompra).mockResolvedValue(1);
    mockPaymentGet.mockResolvedValue(mpPayment({ status }));

    await pagoService.procesarWebhook(webhook());

    expect(movimientoRepository.reembolsarPorPago).toHaveBeenCalledWith(mockClient, PAGO_ID);
    expect(movimientoRepository.insertarReembolso).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ pagoId: PAGO_ID, compradorId: COMPRADOR_ID, montoCentavos: 250_000 }),
    );
    expect(compraRepository.marcarReembolsada).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(ordenFabricacionRepository.cancelarCerradaPorCompra).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(resuelto()).toEqual(["procesado", status]);
  });

  it("refund con payouts ya pagados pide revisión manual", async () => {
    mk(pagoRepository.lockByMpPaymentId).mockResolvedValue({ ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" });
    mk(pagoRepository.marcarReembolsado).mockResolvedValue(true);
    mk(movimientoRepository.existeRetencion).mockResolvedValue(true);
    mk(movimientoRepository.reembolsarPorPago).mockResolvedValue({ revertidos: 1, yaPagados: 2 });
    mockPaymentGet.mockResolvedValue(mpPayment({ status: "refunded" }));

    await pagoService.procesarWebhook(webhook());
    expect(resuelto()).toEqual(["procesado", "refunded:requiere_revision_manual_payouts_pagados=2"]);
    expect(pagoRepository.marcarRevisionAdmin).toHaveBeenCalledWith(
      mockClient,
      PAGO_ID,
      "payouts_pagados_al_reembolsar",
      2,
    );
  });
});

describe("reembolsar", () => {
  const aprobado = { ...pagoBase, mp_payment_id: MP_ID, estado: "aprobado" };

  beforeEach(() => {
    mk(pagoRepository.lockById).mockResolvedValue(aprobado);
    mk(pagoRepository.getById).mockResolvedValue(aprobado);
    mk(pagoRepository.marcarReembolsado).mockResolvedValue(true);
    mk(movimientoRepository.existeRetencion).mockResolvedValue(true);
    mk(movimientoRepository.reembolsarPorPago).mockResolvedValue({ revertidos: 3, yaPagados: 0 });
    mk(compraRepository.lockById).mockResolvedValue({ ...compraBase, estado: "cancelada", tipo: "fabricacion" });
  });

  it("persiste la intención, llama a MP con idempotency key y cierra el ledger", async () => {
    mockRefundTotal.mockResolvedValue({ id: 77 });
    const r = await pagoService.reembolsar(PAGO_ID, "cancelacion_orden");

    expect(r).toBe("reembolsado");
    expect(pagoRepository.marcarReembolsoPendiente).toHaveBeenCalledWith(mockClient, PAGO_ID, "cancelacion_orden");
    expect(mockRefundTotal).toHaveBeenCalledTimes(1);
    expect(pagoRepository.marcarReembolsado).toHaveBeenCalledWith(mockClient, PAGO_ID, "77", "refunded");
    expect(movimientoRepository.insertarReembolso).toHaveBeenCalledTimes(1);
    expect(compraRepository.marcarReembolsada).toHaveBeenCalledWith(mockClient, COMPRA_ID);
  });

  it("si MP falla queda 'pendiente' (reintentable) y no toca el ledger", async () => {
    mockRefundTotal.mockRejectedValue(new Error("MP caído"));
    mockPaymentGet.mockResolvedValue(mpPayment({ status: "approved" }));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const r = await pagoService.reembolsar(PAGO_ID);

    expect(r).toBe("pendiente");
    expect(pagoRepository.marcarReembolsoPendiente).toHaveBeenCalled();
    expect(pagoRepository.marcarReembolsado).not.toHaveBeenCalled();
    expect(movimientoRepository.insertarReembolso).not.toHaveBeenCalled();
  });

  it("si el refund falla pero MP ya lo tiene reembolsado, cierra localmente", async () => {
    mockRefundTotal.mockRejectedValue(new Error("ya reembolsado"));
    mockPaymentGet.mockResolvedValue(mpPayment({ status: "refunded" }));

    expect(await pagoService.reembolsar(PAGO_ID)).toBe("reembolsado");
    expect(pagoRepository.marcarReembolsado).toHaveBeenCalled();
  });

  it("es idempotente: un pago ya reembolsado no vuelve a llamar a MP", async () => {
    mk(pagoRepository.lockById).mockResolvedValue({ ...aprobado, estado: "reembolsado" });
    expect(await pagoService.reembolsar(PAGO_ID)).toBe("reembolsado");
    expect(mockRefundTotal).not.toHaveBeenCalled();
  });

  it("no reembolsa un pago que no está aprobado", async () => {
    mk(pagoRepository.lockById).mockResolvedValue({ ...pagoBase, estado: "pendiente" });
    await expect(pagoService.reembolsar(PAGO_ID)).rejects.toThrow("Solo se puede reembolsar un pago aprobado");
  });
});
