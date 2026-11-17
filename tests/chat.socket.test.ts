process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

type Handler = (...args: unknown[]) => unknown;
const mockConnection: { handler?: Handler } = {};

jest.mock("socket.io", () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: jest.fn(),
    on: (evento: string, handler: Handler) => {
      if (evento === "connection") mockConnection.handler = handler;
    },
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));
jest.mock("../src/sockets/io.instance", () => ({
  getIO: () => ({ to: () => ({ emit: jest.fn() }), in: jest.fn() }),
  setIO: jest.fn(),
}));
jest.mock("../src/repositories/chat.repository", () => ({
  chatRepository: {
    getById: jest.fn(),
    getConOrden: jest.fn(),
    crearMensaje: jest.fn(),
    crearMensajeSiAbierta: jest.fn(),
  },
}));

import { Server as HttpServer } from "http";
import { initChatSocket } from "../src/sockets/chat.socket";
import { chatRepository } from "../src/repositories/chat.repository";

const chat = chatRepository as jest.Mocked<typeof chatRepository>;

const CONV = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

interface SocketFalso {
  data: { user: { id: string } };
  join: jest.Mock;
  leave: jest.Mock;
  on: (evento: string, handler: Handler) => void;
}

function conectarSocket(userId: string): {
  handlers: Record<string, Handler>;
  socket: SocketFalso;
} {
  const handlers: Record<string, Handler> = {};
  const socket: SocketFalso = {
    data: { user: { id: userId } },
    join: jest.fn(),
    leave: jest.fn(),
    on: (evento: string, handler: Handler) => {
      handlers[evento] = handler;
    },
  };
  mockConnection.handler?.(socket);
  return { handlers, socket };
}

const conectar = (userId: string): Record<string, Handler> =>
  conectarSocket(userId).handlers;

const filaConOrden = (extra: Record<string, unknown> = {}) =>
  ({
    id: CONV,
    orden_fabricacion_id: "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f",
    comprador_id: COMPRADOR,
    fabricante_id: FABRICANTE,
    creado_en: "2026-01-01T00:00:00.000Z",
    cerrada_por_comprador_en: null,
    cerrada_por_fabricante_en: null,
    orden_estado: "en_negociacion",
    ...extra,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("socket enviar-mensaje", () => {
  beforeAll(() => {
    initChatSocket({} as HttpServer);
  });

  it("si la contraparte cerró el chat, el ack incluye code CONVERSACION_CERRADA", async () => {
    chat.getConOrden.mockResolvedValue({
      id: CONV,
      orden_fabricacion_id: "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f",
      comprador_id: COMPRADOR,
      fabricante_id: FABRICANTE,
      creado_en: "2026-01-01T00:00:00.000Z",
      cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z",
      cerrada_por_fabricante_en: null,
      orden_estado: "en_negociacion",
    } as never);

    const handlers = conectar(FABRICANTE);
    const ack = jest.fn();
    await handlers["enviar-mensaje"](
      { conversacionId: CONV, contenido: "hola" },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: "La otra parte cerró esta conversación: ya no admite mensajes",
      code: "CONVERSACION_CERRADA",
    });
    expect(chat.crearMensaje).not.toHaveBeenCalled();
  });
});

describe("socket enviar-mensaje: inserción guardada (TOCTOU)", () => {
  beforeAll(() => {
    initChatSocket({} as HttpServer);
  });

  it("si el chat se cerró entre el pre-chequeo y el insert, ack CONVERSACION_CERRADA y nada persistido ni emitido", async () => {
    // Pre-chequeo: abierta. El insert guardado (misma sentencia) ya la ve cerrada.
    chat.getConOrden.mockResolvedValue(filaConOrden());
    chat.crearMensajeSiAbierta.mockResolvedValue(null);

    const handlers = conectar(FABRICANTE);
    const ack = jest.fn();
    await handlers["enviar-mensaje"](
      { conversacionId: CONV, contenido: "  hola  " },
      ack,
    );

    expect(chat.crearMensajeSiAbierta).toHaveBeenCalledWith({
      conversacionId: CONV,
      remitenteId: FABRICANTE,
      contenido: "hola",
      tipo: "texto",
    });
    // Nunca se usa el alta sin guard para mensajes de usuario.
    expect(chat.crearMensaje).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: "La otra parte cerró esta conversación: ya no admite mensajes",
      code: "CONVERSACION_CERRADA",
    });
  });

  it("chat abierto: persiste con el insert guardado y devuelve el mensaje mapeado", async () => {
    chat.getConOrden.mockResolvedValue(filaConOrden());
    chat.crearMensajeSiAbierta.mockResolvedValue({
      id: "msg-1",
      conversacion_id: CONV,
      remitente_id: FABRICANTE,
      contenido: "hola",
      tipo: "texto",
      creado_en: "2026-01-02T00:00:00.000Z",
      comprador_id: COMPRADOR,
      fabricante_id: FABRICANTE,
      cerrada_por_comprador_en: null,
      cerrada_por_fabricante_en: null,
      remitente_username: "fab",
    });

    const handlers = conectar(FABRICANTE);
    const ack = jest.fn();
    await handlers["enviar-mensaje"](
      { conversacionId: CONV, contenido: "hola" },
      ack,
    );
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      mensaje: expect.objectContaining({
        id: "msg-1",
        conversacionId: CONV,
        remitenteId: FABRICANTE,
      }),
    });
  });

  it("no participante: el pre-chequeo corta con 403 sin intentar insertar", async () => {
    chat.getConOrden.mockResolvedValue(filaConOrden());
    const handlers = conectar("7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f");
    const ack = jest.fn();
    await handlers["enviar-mensaje"](
      { conversacionId: CONV, contenido: "hola" },
      ack,
    );
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: "No autorizado para esta conversación",
    });
    expect(chat.crearMensajeSiAbierta).not.toHaveBeenCalled();
  });
});

describe("socket join-conversacion: re-chequeo post-join", () => {
  beforeAll(() => {
    initChatSocket({} as HttpServer);
  });

  it("si el usuario cerró la conversación durante el join, sale de la room y el ack falla", async () => {
    chat.getConOrden
      .mockResolvedValueOnce(filaConOrden())
      .mockResolvedValueOnce(
        filaConOrden({ cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z" }),
      );

    const { handlers, socket } = conectarSocket(COMPRADOR);
    const ack = jest.fn();
    await handlers["join-conversacion"](CONV, ack);

    expect(socket.join).toHaveBeenCalledWith(CONV);
    expect(socket.leave).toHaveBeenCalledWith(CONV);
    expect(socket.leave.mock.invocationCallOrder[0]).toBeGreaterThan(
      socket.join.mock.invocationCallOrder[0],
    );
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: "No autorizado para esta conversación",
    });
  });

  it("si el re-chequeo falla por error de DB, también sale de la room", async () => {
    chat.getConOrden
      .mockResolvedValueOnce(filaConOrden())
      .mockRejectedValueOnce(new Error("db caída"));
    const { handlers, socket } = conectarSocket(FABRICANTE);
    const ack = jest.fn();
    await handlers["join-conversacion"](CONV, ack);
    expect(socket.leave).toHaveBeenCalledWith(CONV);
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: "No autorizado para esta conversación",
    });
  });

  it("sigue autorizado: queda en la room y ack ok", async () => {
    chat.getConOrden.mockResolvedValue(filaConOrden());
    const { handlers, socket } = conectarSocket(FABRICANTE);
    const ack = jest.fn();
    await handlers["join-conversacion"](CONV, ack);
    expect(chat.getConOrden).toHaveBeenCalledTimes(2);
    expect(socket.join).toHaveBeenCalledWith(CONV);
    expect(socket.leave).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});
