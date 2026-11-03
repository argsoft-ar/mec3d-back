const mockClient = { query: jest.fn() };
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: { lockById: jest.fn(), cancelar: jest.fn() },
}));
jest.mock("../src/repositories/orden-fabricacion.repository", () => ({
  ordenFabricacionRepository: { cancelarAbiertasPorCompra: jest.fn() },
}));
jest.mock("../src/repositories/pago.repository", () => ({
  pagoRepository: {
    lockPorCompra: jest.fn(),
    rechazarPendientesPorCompra: jest.fn(),
  },
}));
jest.mock("../src/repositories/chat.repository", () => ({
  chatRepository: {
    getByOrdenFabricacionId: jest.fn(),
    crearMensaje: jest.fn(),
  },
}));
jest.mock("../src/services/chat.service", () => ({
  mapMensaje: (m: unknown) => m,
}));
jest.mock("../src/services/pago.service", () => ({
  pagoService: { iniciarPago: jest.fn(), expirarPreferences: jest.fn() },
}));
jest.mock("../src/services/archivo.service", () => ({ archivoService: {} }));
jest.mock("../src/services/catalogo.service", () => ({ catalogoService: {} }));
jest.mock("../src/services/payout.provider", () => ({
  solicitarPayouts: jest.fn(),
}));
jest.mock("../src/sockets/io.instance", () => ({
  getIO: () => ({ to: mockTo }),
}));

import { compraService } from "../src/services/compra.service";
import { compraRepository } from "../src/repositories/compra.repository";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { pagoRepository } from "../src/repositories/pago.repository";
import { chatRepository } from "../src/repositories/chat.repository";
import { pagoService } from "../src/services/pago.service";

const compras = compraRepository as jest.Mocked<typeof compraRepository>;
const ordenes = ordenFabricacionRepository as jest.Mocked<
  typeof ordenFabricacionRepository
>;
const pagos = pagoRepository as jest.Mocked<typeof pagoRepository>;
const chat = chatRepository as jest.Mocked<typeof chatRepository>;
const pagoSvc = pagoService as jest.Mocked<typeof pagoService>;

const COMPRA_ID = "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FAB_1 = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FAB_2 = "8f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const filaCompra = (extra: Record<string, unknown> = {}) => ({
  id: COMPRA_ID,
  id_comprador: COMPRADOR,
  tipo: "fabricacion",
  estado: "pendiente_pago",
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  compras.lockById.mockResolvedValue(filaCompra() as never);
  compras.cancelar.mockResolvedValue(true);
  ordenes.cancelarAbiertasPorCompra.mockResolvedValue([
    { id: "orden-1", fabricante_id: FAB_1 },
    { id: "orden-2", fabricante_id: FAB_2 },
  ]);
  pagos.lockPorCompra.mockResolvedValue([
    { id: "p1", estado: "pendiente", mp_preference_id: "pref-1" },
    { id: "p0", estado: "rechazado", mp_preference_id: "pref-0" },
    { id: "p2", estado: "rechazado", mp_preference_id: null },
  ] as never);
  pagos.rechazarPendientesPorCompra.mockResolvedValue(1);
  pagoSvc.expirarPreferences.mockResolvedValue(undefined);
  chat.getByOrdenFabricacionId.mockImplementation(
    async (ordenId: string) => ({ id: `conv-${ordenId}` }) as never,
  );
  chat.crearMensaje.mockImplementation(
    async (data) =>
      ({
        id: `msg-${data.conversacionId}`,
        conversacion_id: data.conversacionId,
        remitente_id: null,
        contenido: data.contenido,
        tipo: data.tipo,
        creado_en: "2026-01-01",
        comprador_id: COMPRADOR,
        fabricante_id: FAB_1,
        remitente_username: null,
      }) as never,
  );
});

describe("compraService.cancelar", () => {
  it("tras el commit expira en MP las preferences de los pagos de la compra", async () => {
    await compraService.cancelar(COMPRA_ID, COMPRADOR);
    expect(pagoSvc.expirarPreferences).toHaveBeenCalledWith(["pref-1", "pref-0"]);
    expect(compras.cancelar.mock.invocationCallOrder[0]).toBeLessThan(
      pagoSvc.expirarPreferences.mock.invocationCallOrder[0],
    );
  });

  it("si falla la expiración en MP, la cancelación igual se completa", async () => {
    pagoSvc.expirarPreferences.mockRejectedValue(new Error("MP caído"));
    const res = await compraService.cancelar(COMPRA_ID, COMPRADOR);
    expect(res).toEqual({ compraId: COMPRA_ID, estado: "cancelada" });
    expect(console.error).toHaveBeenCalled();
    expect(chat.crearMensaje).toHaveBeenCalled();
  });

  it("si la cancelación falla, no expira preferences", async () => {
    compras.cancelar.mockResolvedValue(false);
    await expect(
      compraService.cancelar(COMPRA_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(pagoSvc.expirarPreferences).not.toHaveBeenCalled();
  });
  it("fabricación: cancela compra, órdenes abiertas y pagos pendientes; notifica tras el commit", async () => {
    const res = await compraService.cancelar(COMPRA_ID, COMPRADOR);

    expect(res).toEqual({ compraId: COMPRA_ID, estado: "cancelada" });
    expect(compras.lockById).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(ordenes.cancelarAbiertasPorCompra).toHaveBeenCalledWith(
      mockClient,
      COMPRA_ID,
    );
    expect(pagos.lockPorCompra).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(pagos.rechazarPendientesPorCompra).toHaveBeenCalledWith(
      mockClient,
      COMPRA_ID,
    );
    expect(compras.cancelar).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    // Jerarquía de locks: compra -> órdenes -> pagos.
    expect(compras.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      ordenes.cancelarAbiertasPorCompra.mock.invocationCallOrder[0],
    );
    expect(
      ordenes.cancelarAbiertasPorCompra.mock.invocationCallOrder[0],
    ).toBeLessThan(pagos.lockPorCompra.mock.invocationCallOrder[0]);

    for (const ordenId of ["orden-1", "orden-2"]) {
      expect(chat.crearMensaje).toHaveBeenCalledWith({
        conversacionId: `conv-${ordenId}`,
        remitenteId: null,
        contenido: "El comprador canceló la solicitud de fabricación",
        tipo: "sistema",
      });
      expect(mockTo).toHaveBeenCalledWith(`conv-${ordenId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        "orden-cancelada",
        expect.objectContaining({ ordenFabricacionId: ordenId }),
      );
    }
    expect(mockTo).toHaveBeenCalledWith(`user:${COMPRADOR}`);
    expect(mockTo).toHaveBeenCalledWith(`user:${FAB_1}`);
    expect(mockEmit).toHaveBeenCalledWith(
      "notificacion-mensaje",
      expect.objectContaining({ tipo: "sistema" }),
    );
    // Post-commit: el mensaje se crea después de cancelar la compra.
    expect(compras.cancelar.mock.invocationCallOrder[0]).toBeLessThan(
      chat.crearMensaje.mock.invocationCallOrder[0],
    );
  });

  it("descarga: no toca órdenes ni emite eventos", async () => {
    compras.lockById.mockResolvedValue(
      filaCompra({ tipo: "descarga" }) as never,
    );
    await compraService.cancelar(COMPRA_ID, COMPRADOR);
    expect(ordenes.cancelarAbiertasPorCompra).not.toHaveBeenCalled();
    expect(compras.cancelar).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("404 si la compra no existe", async () => {
    compras.lockById.mockResolvedValue(null);
    await expect(
      compraService.cancelar(COMPRA_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(compras.cancelar).not.toHaveBeenCalled();
  });

  it("403 si no es el comprador", async () => {
    await expect(
      compraService.cancelar(COMPRA_ID, AJENO),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(ordenes.cancelarAbiertasPorCompra).not.toHaveBeenCalled();
    expect(compras.cancelar).not.toHaveBeenCalled();
  });

  it.each(["pagada", "completada", "reembolsada", "cancelada"])(
    "compra %s: 409 COMPRA_NO_CANCELABLE",
    async (estado) => {
      compras.lockById.mockResolvedValue(filaCompra({ estado }) as never);
      await expect(
        compraService.cancelar(COMPRA_ID, COMPRADOR),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "COMPRA_NO_CANCELABLE",
      });
      expect(compras.cancelar).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    },
  );

  it("con un pago aprobado (aún sin reflejar en la compra): 409 y sin efectos", async () => {
    pagos.lockPorCompra.mockResolvedValue([
      { id: "p1", estado: "aprobado" },
    ] as never);
    await expect(
      compraService.cancelar(COMPRA_ID, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409, code: "COMPRA_NO_CANCELABLE" });
    expect(pagos.rechazarPendientesPorCompra).not.toHaveBeenCalled();
    expect(compras.cancelar).not.toHaveBeenCalled();
    expect(chat.crearMensaje).not.toHaveBeenCalled();
  });

  it("si un fallo del chat ocurre post-commit, la cancelación igual responde ok", async () => {
    chat.crearMensaje.mockRejectedValue(new Error("chat caído"));
    await expect(
      compraService.cancelar(COMPRA_ID, COMPRADOR),
    ).resolves.toEqual({ compraId: COMPRA_ID, estado: "cancelada" });
  });
});
