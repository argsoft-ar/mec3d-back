const mockQuery = jest.fn();
jest.mock("../src/config/db.config", () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
let mockIO: { to: typeof mockTo } | null = { to: mockTo };
jest.mock("../src/sockets/io.instance", () => ({
  getIO: () => mockIO,
}));

import { chatRepository } from "../src/repositories/chat.repository";
import { chatService } from "../src/services/chat.service";
import {
  notificarMensaje,
  notificarUsuario,
} from "../src/sockets/notificaciones";
import { MensajeCreadoRow } from "../src/interfaces/chat.interface";

const CONV = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const fila = (extra: Partial<MensajeCreadoRow> = {}): MensajeCreadoRow => ({
  id: "msg-1",
  conversacion_id: CONV,
  remitente_id: COMPRADOR,
  contenido: "Hola",
  tipo: "texto",
  creado_en: "2026-01-01T00:00:00.000Z",
  comprador_id: COMPRADOR,
  fabricante_id: FABRICANTE,
  remitente_username: "comprador1",
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockIO = { to: mockTo };
});

describe("notificaciones", () => {
  it("notificacion-mensaje va solo al otro participante", () => {
    notificarMensaje(fila());
    expect(mockTo).toHaveBeenCalledTimes(1);
    expect(mockTo).toHaveBeenCalledWith(`user:${FABRICANTE}`);
    expect(mockEmit).toHaveBeenCalledWith("notificacion-mensaje", {
      conversacionId: CONV,
      mensajeId: "msg-1",
      remitenteUsername: "comprador1",
      preview: "Hola",
      tipo: "texto",
      creadoEn: "2026-01-01T00:00:00.000Z",
    });
  });

  it("los mensajes de sistema van a ambos participantes", () => {
    notificarMensaje(
      fila({ remitente_id: null, remitente_username: null, tipo: "sistema" }),
    );
    expect(mockTo.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      `user:${COMPRADOR}`,
      `user:${FABRICANTE}`,
    ]);
    expect(mockEmit.mock.calls[0][1]).toMatchObject({
      remitenteUsername: null,
      tipo: "sistema",
    });
  });

  it("respeta la lista de excluidos", () => {
    notificarMensaje(fila({ remitente_id: null }), [COMPRADOR]);
    expect(mockTo).toHaveBeenCalledTimes(1);
    expect(mockTo).toHaveBeenCalledWith(`user:${FABRICANTE}`);
  });

  it("omite a quien cerró la conversación (incluso en mensajes de sistema)", () => {
    notificarMensaje(
      fila({
        remitente_id: null,
        remitente_username: null,
        tipo: "sistema",
        cerrada_por_comprador_en: "2026-01-02T00:00:00.000Z",
      }),
    );
    expect(mockTo).toHaveBeenCalledTimes(1);
    expect(mockTo).toHaveBeenCalledWith(`user:${FABRICANTE}`);
  });

  it("si el destinatario cerró la conversación no se le notifica nada", () => {
    notificarMensaje(
      fila({ cerrada_por_fabricante_en: "2026-01-02T00:00:00.000Z" }),
    );
    expect(mockTo).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("el preview es texto plano truncado a ~100 caracteres", () => {
    notificarMensaje(
      fila({ contenido: `<b>hola</b> <script>x</script>${"a".repeat(300)}` }),
    );
    const { preview } = mockEmit.mock.calls[0][1];
    expect(preview).not.toMatch(/[<>]/);
    expect(preview.startsWith("hola x")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(100);
  });

  it("no-op si el socket no está inicializado", () => {
    mockIO = null;
    expect(() => notificarUsuario(FABRICANTE, "x", {})).not.toThrow();
    expect(() => notificarMensaje(fila())).not.toThrow();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe("chatRepository (no leídos)", () => {
  it("crearMensaje marca leída la conversación para el remitente y devuelve participantes", async () => {
    mockQuery.mockResolvedValue({ rows: [fila()] });
    const res = await chatRepository.crearMensaje({
      conversacionId: CONV,
      remitenteId: COMPRADOR,
      contenido: "Hola",
      tipo: "texto",
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO mensajes/);
    expect(sql).toMatch(/INSERT INTO conversacion_lecturas/);
    expect(sql).toMatch(/remitente_id IS NOT NULL/);
    expect(sql).toMatch(/c\.comprador_id, c\.fabricante_id/);
    expect(params).toEqual([CONV, COMPRADOR, "Hola", "texto"]);
    expect(res.fabricante_id).toBe(FABRICANTE);
  });

  it("crearMensaje devuelve el estado de cierre para que el notificador omita a quien cerró", async () => {
    mockQuery.mockResolvedValue({ rows: [fila()] });
    await chatRepository.crearMensaje({
      conversacionId: CONV,
      remitenteId: null,
      contenido: "x",
      tipo: "sistema",
    });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(
      /c\.cerrada_por_comprador_en, c\.cerrada_por_fabricante_en/,
    );
  });

  it("crearMensajeSiAbierta: una sola sentencia con guard de cierre/estado y FOR SHARE OF c", async () => {
    mockQuery.mockResolvedValue({ rows: [fila()] });
    const res = await chatRepository.crearMensajeSiAbierta({
      conversacionId: CONV,
      remitenteId: COMPRADOR,
      contenido: "Hola",
      tipo: "texto",
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/\$2::uuid IN \(c\.comprador_id, c\.fabricante_id\)/);
    expect(sql).toMatch(/c\.cerrada_por_comprador_en IS NULL/);
    expect(sql).toMatch(/c\.cerrada_por_fabricante_en IS NULL/);
    expect(sql).toMatch(/o\.estado NOT IN \('cancelado', 'rechazado'\)/);
    expect(sql).toMatch(/FOR SHARE OF c\b/);
    expect(sql).not.toMatch(/FOR (UPDATE|SHARE) OF o/);
    // El INSERT se alimenta del SELECT guardado (no VALUES): sin fila no inserta.
    expect(sql).toMatch(/INSERT INTO mensajes[^;]*SELECT conv\.id/);
    expect(sql).not.toMatch(/VALUES \(\$1, \$2, \$3, \$4\)/);
    expect(params).toEqual([CONV, COMPRADOR, "Hola", "texto"]);
    expect(res?.id).toBe("msg-1");
  });

  it("crearMensajeSiAbierta: devuelve null si la conversación está cerrada (no se insertó)", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(
      chatRepository.crearMensajeSiAbierta({
        conversacionId: CONV,
        remitenteId: COMPRADOR,
        contenido: "Hola",
        tipo: "texto",
      }),
    ).resolves.toBeNull();
  });

  it("lockById bloquea la conversación FOR UPDATE con el cliente de la transacción", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: CONV }] }) };
    await chatRepository.lockById(db, CONV);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/FROM conversaciones[\s\S]*FOR UPDATE/);
    expect(params).toEqual([CONV]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("contarNoLeidosTotal excluye mensajes propios y usa la última lectura", async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: 4 }] });
    expect(await chatRepository.contarNoLeidosTotal(COMPRADOR)).toBe(4);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/remitente_id IS DISTINCT FROM \$1/);
    expect(sql).toMatch(
      /l\.ultima_lectura_en IS NULL OR m\.creado_en > l\.ultima_lectura_en/,
    );
    expect(sql).toMatch(
      /c\.comprador_id = \$1 AND c\.cerrada_por_comprador_en IS NULL/,
    );
    expect(sql).toMatch(
      /c\.fabricante_id = \$1 AND c\.cerrada_por_fabricante_en IS NULL/,
    );
    expect(params).toEqual([COMPRADOR]);
  });

  it("getConversacionesByUsuario excluye las conversaciones que el usuario cerró", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await chatRepository.getConversacionesByUsuario(COMPRADOR);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(
      /c\.comprador_id = \$1 AND c\.cerrada_por_comprador_en IS NULL/,
    );
    expect(sql).toMatch(
      /c\.fabricante_id = \$1 AND c\.cerrada_por_fabricante_en IS NULL/,
    );
    expect(sql).toMatch(/c\.cerrada_por_comprador_en, c\.cerrada_por_fabricante_en/);
  });

  it("cerrarParaUsuario solo marca la columna del rol y es idempotente", async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: CONV }] }) };
    await chatRepository.cerrarParaUsuario(db, CONV, "fabricante");
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(
      /SET cerrada_por_fabricante_en = COALESCE\(cerrada_por_fabricante_en, now\(\)\)/,
    );
    expect(sql).not.toMatch(/cerrada_por_comprador_en =/);
    expect(params).toEqual([CONV]);
  });

  it("getConversacionesByUsuario calcula no_leidos en la misma query", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await chatRepository.getConversacionesByUsuario(COMPRADOR);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/AS no_leidos/);
    expect(sql).toMatch(/LEFT JOIN conversacion_lecturas l/);
  });

  it("marcarLeida hace upsert sin retroceder la marca", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await chatRepository.marcarLeida(CONV, COMPRADOR);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(
      /ON CONFLICT \(conversacion_id, usuario_id\) DO UPDATE/,
    );
    expect(sql).toMatch(/GREATEST/);
    expect(params).toEqual([CONV, COMPRADOR]);
  });
});

describe("chatService (no leídos)", () => {
  const conversacion = {
    id: CONV,
    comprador_id: COMPRADOR,
    fabricante_id: FABRICANTE,
  };

  it("marcarLeida: 404 si la conversación no existe", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(null);
    const marcar = jest.spyOn(chatRepository, "marcarLeida");
    await expect(
      chatService.marcarLeida(CONV, COMPRADOR),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(marcar).not.toHaveBeenCalled();
  });

  it("marcarLeida: 403 si no es participante", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(conversacion);
    const marcar = jest.spyOn(chatRepository, "marcarLeida");
    await expect(chatService.marcarLeida(CONV, AJENO)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(marcar).not.toHaveBeenCalled();
  });

  it("marcarLeida: participante queda en 0", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(conversacion);
    const marcar = jest
      .spyOn(chatRepository, "marcarLeida")
      .mockResolvedValue(undefined);
    expect(await chatService.marcarLeida(CONV, FABRICANTE)).toEqual({
      conversacionId: CONV,
      noLeidos: 0,
    });
    expect(marcar).toHaveBeenCalledWith(CONV, FABRICANTE);
  });

  it("listarMensajes marca la conversación como leída", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(conversacion);
    jest
      .spyOn(chatRepository, "getMensajesPaginated")
      .mockResolvedValue({ rows: [], total: 0 });
    const marcar = jest
      .spyOn(chatRepository, "marcarLeida")
      .mockResolvedValue(undefined);
    await chatService.listarMensajes(CONV, COMPRADOR, 1, 20);
    expect(marcar).toHaveBeenCalledWith(CONV, COMPRADOR);
  });

  it("listarConversaciones expone noLeidos numérico", async () => {
    jest.spyOn(chatRepository, "getConversacionesByUsuario").mockResolvedValue([
      {
        id: CONV,
        comprador_id: COMPRADOR,
        fabricante_id: FABRICANTE,
        precio_acordado: null,
        precio_propuesto_comprador: null,
        precio_propuesto_fabricante: null,
        ultimo_mensaje_contenido: null,
        no_leidos: 3,
      },
    ]);
    const [res] = await chatService.listarConversaciones(COMPRADOR);
    expect(res.noLeidos).toBe(3);
  });

  it("contarNoLeidos devuelve { total }", async () => {
    jest.spyOn(chatRepository, "contarNoLeidosTotal").mockResolvedValue(7);
    expect(await chatService.contarNoLeidos(COMPRADOR)).toEqual({ total: 7 });
  });
});
