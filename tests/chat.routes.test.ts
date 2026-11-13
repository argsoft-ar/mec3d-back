process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: jest.fn() },
}));

import request from "supertest";
import app from "../src/app";
import { ORIGIN } from "./helpers/session";
import { generateToken } from "../src/utils/jwt.util";
import { chatRepository } from "../src/repositories/chat.repository";

jest.setTimeout(30_000);

const CONV = "1a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const FABRICANTE = "6d2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const auth = (id: string) =>
  `mec3d_session=${generateToken({ id, email: "x@mec3d.com", rolPrincipal: "comprador" })}`;

const BASE = "/api/v1/conversaciones";
const conversacion = {
  id: CONV,
  comprador_id: COMPRADOR,
  fabricante_id: FABRICANTE,
};

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /conversaciones/:id/leer", () => {
  it("participante: 200 con noLeidos 0", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(conversacion);
    const marcar = jest
      .spyOn(chatRepository, "marcarLeida")
      .mockResolvedValue(undefined);
    const res = await request(app)
      .post(`${BASE}/${CONV}/leer`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(FABRICANTE));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: expect.any(String),
      data: { conversacionId: CONV, noLeidos: 0 },
    });
    expect(marcar).toHaveBeenCalledWith(CONV, FABRICANTE);
  });

  it("no participante: 403 sin marcar", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(conversacion);
    const marcar = jest.spyOn(chatRepository, "marcarLeida");
    const res = await request(app)
      .post(`${BASE}/${CONV}/leer`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(AJENO));
    expect(res.status).toBe(403);
    expect(marcar).not.toHaveBeenCalled();
  });

  it("inexistente: 404", async () => {
    jest.spyOn(chatRepository, "getById").mockResolvedValue(null);
    const res = await request(app)
      .post(`${BASE}/${CONV}/leer`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(404);
  });

  it("id inválido: 400", async () => {
    const res = await request(app)
      .post(`${BASE}/no-es-uuid/leer`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(400);
  });

  it("sin token: 401", async () => {
    const res = await request(app)
      .post(`${BASE}/${CONV}/leer`)
      .set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });
});

describe("GET /conversaciones/no-leidos", () => {
  it("devuelve el total del usuario autenticado", async () => {
    const contar = jest
      .spyOn(chatRepository, "contarNoLeidosTotal")
      .mockResolvedValue(5);
    const res = await request(app)
      .get(`${BASE}/no-leidos`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: expect.any(String),
      data: { total: 5 },
    });
    expect(contar).toHaveBeenCalledWith(COMPRADOR);
  });

  it("sin token: 401", async () => {
    const res = await request(app).get(`${BASE}/no-leidos`);
    expect(res.status).toBe(401);
  });
});
