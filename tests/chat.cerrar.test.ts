process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

const mockClient = { query: jest.fn() };
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockSocketsLeave = jest.fn();
const mockIn = jest.fn(() => ({ socketsLeave: mockSocketsLeave }));

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: jest.fn() },
}));
jest.mock("../src/repositories/orden-fabricacion.repository", () => ({
  ordenFabricacionRepository: {
    getById: jest.fn(),
    lockById: jest.fn(),
    cerrarPorChat: jest.fn(),
  },
}));
jest.mock("../src/repositories/compra.repository", () => ({
  compraRepository: { lockById: jest.fn() },
}));
jest.mock("../src/repositories/chat.repository", () => ({
  chatRepository: {
    getById: jest.fn(),
    getConOrden: jest.fn(),
    lockById: jest.fn(),
    cerrarParaUsuario: jest.fn(),
    crearMensaje: jest.fn(),
    marcarLeida: jest.fn(),
    getMensajesPaginated: jest.fn(),
    getConversacionesByUsuario: jest.fn(),
    contarNoLeidosTotal: jest.fn(),
  },
}));
jest.mock("../src/sockets/io.instance", () => ({
  getIO: () => ({ to: mockTo, in: mockIn }),
  setIO: jest.fn(),
}));

import request from "supertest";
import app from "../src/app";
import { ORIGIN } from "./helpers/session";
import { generateToken } from "../src/utils/jwt.util";
import { chatService } from "../src/services/chat.service";
import { chatRepository } from "../src/repositories/chat.repository";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { compraRepository } from "../src/repositories/compra.repository";
import { MensajeCreadoRow } from "../src/interfaces/chat.interface";

jest.setTimeout(30_000);

const chat = chatRepository as jest.Mocked<typeof chatRepository>;
const ordenes = ordenFabricacionRepository as jest.Mocked<
  typeof ordenFabricacionRepository
>;
const compras = compraRepository as jest.Mocked<typeof compraRepository>;

const CONV = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const ORDEN_ID = "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRA_ID = "3a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const BASE = "/api/v1/conversaciones";

const auth = (id: string) =>
  `mec3d_session=${generateToken({ id, email: "x@mec3d.com", rolPrincipal: "comprador" })}`;

const filaConversacion = (extra: Record<string, unknown> = {}) => ({
  id: CONV,
  orden_fabricacion_id: ORDEN_ID,
  comprador_id: COMPRADOR,
  fabricante_id: FABRICANTE,
  creado_en: "2026-01-01T00:00:00.000Z",
  cerrada_por_comprador_en: null,
  cerrada_por_fabricante_en: null,
  ...extra,
});

const filaOrden = (estado: string) => ({
  id: ORDEN_ID,
  compra_id: COMPRA_ID,
  fabricante_id: FABRICANTE,
  id_comprador: COMPRADOR,
  estado,
  compra_estado: "pendiente_pago",
});

const mensajeSistema = (contenido: string): MensajeCreadoRow => ({
  id: "msg-1",
  conversacion_id: CONV,
  remitente_id: null,
  contenido,
  tipo: "sistema",
  creado_en: "2026-01-02T00:00:00.000Z",
  comprador_id: COMPRADOR,
  fabricante_id: FABRICANTE,
  remitente_username: null,
});

function prepararOrden(estado: string, conversacion = filaConversacion()) {
  chat.getById.mockResolvedValue(conversacion);
  ordenes.getById.mockResolvedValue(filaOrden(estado));
  ordenes.lockById.mockResolvedValue(filaOrden(estado));
  compras.lockById.mockResolvedValue({ id: COMPRA_ID } as never);
  chat.lockById.mockResolvedValue(conversacion);
  chat.cerrarParaUsuario.mockResolvedValue(filaConversacion());
}

const eventos = () =>
  mockTo.mock.calls.map((c, i) => ({
    sala: (c as unknown[])[0],
    evento: mockEmit.mock.calls[i]?.[0],
    payload: mockEmit.mock.calls[i]?.[1],
  }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("chatService.cerrarConversacion", () => {
  it("comprador en en_negociacion: cancela la orden, mensaje de sistema y oculta solo para él", async () => {
    prepararOrden("en_negociacion");
    ordenes.cerrarPorChat.mockResolvedValue({
      ...filaOrden("cancelado"),
    });
    const contenido =
      "El comprador cerró el chat y canceló la solicitud. Podés eliminar esta conversación.";
    chat.crearMensaje.mockResolvedValue(mensajeSistema(contenido));

    const res = await chatService.cerrarConversacion(CONV, COMPRADOR);

    expect(res).toEqual({ conversacionId: CONV, ordenEstado: "cancelado" });
    // Locks compra -> orden -> conversación dentro de la transacción.
    expect(compras.lockById).toHaveBeenCalledWith(mockClient, COMPRA_ID);
    expect(ordenes.lockById).toHaveBeenCalledWith(mockClient, ORDEN_ID);
    expect(chat.lockById).toHaveBeenCalledWith(mockClient, CONV);
    expect(compras.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      ordenes.lockById.mock.invocationCallOrder[0],
    );
    expect(ordenes.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      chat.lockById.mock.invocationCallOrder[0],
    );
    // La conversación queda bloqueada antes de cualquier escritura.
    expect(chat.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      ordenes.cerrarPorChat.mock.invocationCallOrder[0],
    );
    expect(ordenes.cerrarPorChat).toHaveBeenCalledWith(
      mockClient,
      ORDEN_ID,
      "cancelado",
    );
    expect(chat.crearMensaje).toHaveBeenCalledWith(
      {
        conversacionId: CONV,
        remitenteId: null,
        contenido,
        tipo: "sistema",
      },
      mockClient,
    );
    expect(chat.cerrarParaUsuario).toHaveBeenCalledWith(
      mockClient,
      CONV,
      "comprador",
    );

    const emitidos = eventos();
    expect(emitidos).toContainEqual({
      sala: CONV,
      evento: "orden-cancelada",
      payload: expect.objectContaining({
        ordenFabricacionId: ORDEN_ID,
        estado: "cancelado",
        cerradaPor: "comprador",
        mensaje: expect.objectContaining({
          conversacionId: CONV,
          remitenteId: null,
          tipo: "sistema",
          contenido,
        }),
      }),
    });
    // notificacion-mensaje solo a la contraparte (quien cerró ya no ve el chat).
    expect(emitidos).toContainEqual(
      expect.objectContaining({
        sala: `user:${FABRICANTE}`,
        evento: "notificacion-mensaje",
      }),
    );
    expect(emitidos).not.toContainEqual(
      expect.objectContaining({ sala: `user:${COMPRADOR}` }),
    );
    expect(emitidos).toContainEqual({
      sala: `user:${FABRICANTE}`,
      evento: "conversacion-cerrada",
      payload: {
        conversacionId: CONV,
        ordenFabricacionId: ORDEN_ID,
        ordenEstado: "cancelado",
        cerradaPor: "comprador",
      },
    });
    expect(mockIn).toHaveBeenCalledWith(`user:${COMPRADOR}`);
    expect(mockSocketsLeave).toHaveBeenCalledWith(CONV);
  });

  it("fabricante en solicitado: la orden queda rechazada", async () => {
    prepararOrden("solicitado");
    ordenes.cerrarPorChat.mockResolvedValue(filaOrden("rechazado"));
    chat.crearMensaje.mockResolvedValue(
      mensajeSistema(
        "El fabricante cerró el chat y rechazó la solicitud. Podés eliminar esta conversación.",
      ),
    );

    const res = await chatService.cerrarConversacion(CONV, FABRICANTE);

    expect(res).toEqual({ conversacionId: CONV, ordenEstado: "rechazado" });
    expect(ordenes.cerrarPorChat).toHaveBeenCalledWith(
      mockClient,
      ORDEN_ID,
      "rechazado",
    );
    expect(chat.crearMensaje.mock.calls[0][0].contenido).toMatch(
      /fabricante cerró el chat y rechazó/,
    );
    expect(chat.cerrarParaUsuario).toHaveBeenCalledWith(
      mockClient,
      CONV,
      "fabricante",
    );
  });

  it.each(["trato_cerrado", "confirmada", "en_disputa"])(
    "%s: 409 sin tocar orden ni conversación",
    async (estado) => {
      prepararOrden(estado);
      await expect(
        chatService.cerrarConversacion(CONV, COMPRADOR),
      ).rejects.toMatchObject({ statusCode: 409, code: "CHAT_NO_CERRABLE" });
      expect(ordenes.cerrarPorChat).not.toHaveBeenCalled();
      expect(chat.crearMensaje).not.toHaveBeenCalled();
      expect(chat.cerrarParaUsuario).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    },
  );

  it("re-valida el estado dentro de la transacción (cambió a trato_cerrado)", async () => {
    prepararOrden("en_negociacion");
    ordenes.lockById.mockResolvedValue(filaOrden("trato_cerrado"));
    await expect(
      chatService.cerrarConversacion(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(ordenes.cerrarPorChat).not.toHaveBeenCalled();
  });

  it("no participante: 403", async () => {
    prepararOrden("en_negociacion");
    await expect(
      chatService.cerrarConversacion(CONV, AJENO),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(ordenes.cerrarPorChat).not.toHaveBeenCalled();
  });

  it("inexistente: 404", async () => {
    chat.getById.mockResolvedValue(null);
    await expect(
      chatService.cerrarConversacion(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(["cancelado", "rechazado", "completado"])(
    "orden %s (la contraparte ya cerró): solo oculta, sin mensaje de sistema",
    async (estado) => {
      prepararOrden(
        estado,
        filaConversacion({
          cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z",
        }),
      );
      const res = await chatService.cerrarConversacion(CONV, FABRICANTE);
      expect(res).toEqual({ conversacionId: CONV, ordenEstado: estado });
      expect(ordenes.cerrarPorChat).not.toHaveBeenCalled();
      expect(chat.crearMensaje).not.toHaveBeenCalled();
      expect(chat.cerrarParaUsuario).toHaveBeenCalledWith(
        mockClient,
        CONV,
        "fabricante",
      );
      const emitidos = eventos();
      expect(emitidos.map((e) => e.evento)).toEqual(["conversacion-cerrada"]);
      expect(emitidos[0].sala).toBe(`user:${COMPRADOR}`);
    },
  );

  it("cierre concurrente ya aplicado (visto bajo lock): idempotente, sin efectos ni avisos", async () => {
    prepararOrden("en_negociacion");
    chat.lockById.mockResolvedValue(
      filaConversacion({ cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z" }),
    );
    const res = await chatService.cerrarConversacion(CONV, COMPRADOR);
    expect(res).toEqual({
      conversacionId: CONV,
      ordenEstado: "en_negociacion",
    });
    expect(ordenes.cerrarPorChat).not.toHaveBeenCalled();
    expect(chat.crearMensaje).not.toHaveBeenCalled();
    expect(chat.cerrarParaUsuario).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("cerrar dos veces es idempotente: 200 sin transacción ni efectos", async () => {
    prepararOrden(
      "cancelado",
      filaConversacion({ cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z" }),
    );
    const res = await chatService.cerrarConversacion(CONV, COMPRADOR);
    expect(res).toEqual({ conversacionId: CONV, ordenEstado: "cancelado" });
    expect(ordenes.lockById).not.toHaveBeenCalled();
    expect(chat.cerrarParaUsuario).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("acceso a conversaciones cerradas", () => {
  const cerradaPorComprador = filaConversacion({
    cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z",
  });

  it("listarMensajes y marcarLeida: 404 para quien la cerró", async () => {
    chat.getById.mockResolvedValue(cerradaPorComprador);
    await expect(
      chatService.listarMensajes(CONV, COMPRADOR, 1, 20),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      chatService.marcarLeida(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(chat.marcarLeida).not.toHaveBeenCalled();
  });

  it("la contraparte sigue viendo el historial", async () => {
    chat.getById.mockResolvedValue(cerradaPorComprador);
    chat.getMensajesPaginated.mockResolvedValue({ rows: [], total: 0 });
    await expect(
      chatService.listarMensajes(CONV, FABRICANTE, 1, 20),
    ).resolves.toMatchObject({ data: [] });
  });

  it("listarConversaciones expone cerradaPorContraparte", async () => {
    const base = {
      precio_acordado: null,
      precio_propuesto_comprador: null,
      precio_propuesto_fabricante: null,
      ultimo_mensaje_contenido: null,
      no_leidos: 0,
    };
    chat.getConversacionesByUsuario.mockResolvedValue([
      { ...cerradaPorComprador, ...base },
      { ...filaConversacion({ id: "otra" }), ...base },
    ]);
    const res = await chatService.listarConversaciones(FABRICANTE);
    expect(res.map((c) => c.cerradaPorContraparte)).toEqual([true, false]);
  });

  it("puedeUnirse: rechaza a quien la cerró y a ajenos", async () => {
    chat.getConOrden.mockResolvedValue({
      ...cerradaPorComprador,
      orden_estado: "cancelado",
    });
    expect(await chatService.puedeUnirse(CONV, COMPRADOR)).toBe(false);
    expect(await chatService.puedeUnirse(CONV, AJENO)).toBe(false);
    expect(await chatService.puedeUnirse(CONV, FABRICANTE)).toBe(true);
  });

  it("assertPuedeEnviar: bloquea si cualquiera cerró o la orden fue cancelada/rechazada", async () => {
    chat.getConOrden.mockResolvedValue({
      ...cerradaPorComprador,
      orden_estado: "completado",
    });
    await expect(
      chatService.assertPuedeEnviar(CONV, FABRICANTE),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONVERSACION_CERRADA" });
    await expect(
      chatService.assertPuedeEnviar(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });

    chat.getConOrden.mockResolvedValue({
      ...filaConversacion(),
      orden_estado: "rechazado",
    });
    await expect(
      chatService.assertPuedeEnviar(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 409 });

    chat.getConOrden.mockResolvedValue({
      ...filaConversacion(),
      orden_estado: "en_negociacion",
    });
    await expect(
      chatService.assertPuedeEnviar(CONV, AJENO),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      chatService.assertPuedeEnviar(CONV, COMPRADOR),
    ).resolves.toBeUndefined();
  });
});

describe("POST /conversaciones/:id/cerrar", () => {
  it("participante: 200 con { conversacionId, ordenEstado }", async () => {
    prepararOrden("en_negociacion");
    ordenes.cerrarPorChat.mockResolvedValue(filaOrden("cancelado"));
    chat.crearMensaje.mockResolvedValue(mensajeSistema("x"));
    const res = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: expect.any(String),
      data: { conversacionId: CONV, ordenEstado: "cancelado" },
    });
  });

  it("no participante: 403", async () => {
    prepararOrden("en_negociacion");
    const res = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(AJENO));
    expect(res.status).toBe(403);
    expect(chat.cerrarParaUsuario).not.toHaveBeenCalled();
  });

  it("trato cerrado: 409", async () => {
    prepararOrden("trato_cerrado");
    const res = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(FABRICANTE));
    expect(res.status).toBe(409);
  });

  it("id inválido: 400", async () => {
    const res = await request(app)
      .post(`${BASE}/no-es-uuid/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(400);
  });

  it("sin sesión: 401", async () => {
    const res = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });

  it("limiter dedicado: 30 cierres por usuario cada 15 min, luego 429", async () => {
    const USUARIO_LIMITE = "8f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
    chat.getById.mockResolvedValue(null);
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post(`${BASE}/${CONV}/cerrar`)
        .set("Origin", ORIGIN)
        .set("Cookie", auth(USUARIO_LIMITE));
      expect(res.status).toBe(404);
    }
    const bloqueada = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(USUARIO_LIMITE));
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body).toEqual({
      error: "Demasiados cierres de chat, intente más tarde",
    });
    // Es por usuario: otro participante no queda afectado.
    const otro = await request(app)
      .post(`${BASE}/${CONV}/cerrar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(AJENO));
    expect(otro.status).not.toBe(429);
  });
});
