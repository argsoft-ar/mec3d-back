process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";
process.env.MP_ACCESS_TOKEN = "TEST-token";
process.env.MP_WEBHOOK_SECRET = "secreto-webhook-de-prueba";
process.env.MP_NOTIFICATION_URL =
  "https://api.example.com/api/v1/webhooks/mercadopago";
process.env.FRONTEND_URL = "https://front.example.com";

const mockClient = { query: jest.fn() };
jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: (fn: (c: unknown) => unknown) => fn(mockClient),
}));
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: jest.fn() },
}));

import request from "supertest";
import app from "../src/app";
import { ORIGIN } from "./helpers/session";
import pool from "../src/config/db.config";
import { generateToken } from "../src/utils/jwt.util";
import { compraRepository } from "../src/repositories/compra.repository";
import { ordenFabricacionRepository } from "../src/repositories/orden-fabricacion.repository";
import { pagoRepository } from "../src/repositories/pago.repository";

jest.setTimeout(30_000);

const COMPRA_ID = "2a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const COMPRADOR = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const AJENO = "7e2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

const auth = (id: string) =>
  `mec3d_session=${generateToken({ id, email: "x@mec3d.com", rolPrincipal: "comprador" })}`;

const filaCompra = (extra: Record<string, unknown> = {}) => ({
  id: COMPRA_ID,
  id_comprador: COMPRADOR,
  id_modelo: "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f",
  tipo: "descarga",
  estado: "pendiente_pago",
  monto_centavos: "10000",
  ...extra,
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest
    .spyOn(compraRepository, "lockById")
    .mockResolvedValue(filaCompra() as never);
  jest.spyOn(compraRepository, "cancelar").mockResolvedValue(true);
  jest
    .spyOn(ordenFabricacionRepository, "cancelarAbiertasPorCompra")
    .mockResolvedValue([]);
  jest.spyOn(pagoRepository, "lockPorCompra").mockResolvedValue([]);
  jest
    .spyOn(pagoRepository, "rechazarPendientesPorCompra")
    .mockResolvedValue(0);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /compras/:id/cancelar", () => {
  const ruta = `/api/v1/compras/${COMPRA_ID}/cancelar`;

  it("exige token", async () => {
    expect((await request(app).post(ruta).set("Origin", ORIGIN)).status).toBe(
      401,
    );
  });

  it("valida que el id sea UUID", async () => {
    const res = await request(app)
      .post("/api/v1/compras/no-uuid/cancelar")
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(400);
  });

  it("el comprador cancela su compra pendiente: 200 { message, data }", async () => {
    const res = await request(app)
      .post(ruta)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Compra cancelada",
      data: { compraId: COMPRA_ID, estado: "cancelada" },
    });
    expect(compraRepository.cancelar).toHaveBeenCalledWith(
      mockClient,
      COMPRA_ID,
    );
  });

  it("otro usuario recibe 403 y no se cancela nada", async () => {
    const res = await request(app)
      .post(ruta)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(AJENO));
    expect(res.status).toBe(403);
    expect(compraRepository.cancelar).not.toHaveBeenCalled();
  });

  it("compra inexistente: 404", async () => {
    jest.spyOn(compraRepository, "lockById").mockResolvedValue(null);
    const res = await request(app)
      .post(ruta)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(404);
  });

  it("compra pagada: 409 COMPRA_NO_CANCELABLE", async () => {
    jest
      .spyOn(compraRepository, "lockById")
      .mockResolvedValue(filaCompra({ estado: "pagada" }) as never);
    const res = await request(app)
      .post(ruta)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COMPRA_NO_CANCELABLE");
    expect(compraRepository.cancelar).not.toHaveBeenCalled();
  });

  it("pago aprobado todavía no reflejado en la compra: 409 COMPRA_NO_CANCELABLE", async () => {
    jest
      .spyOn(pagoRepository, "lockPorCompra")
      .mockResolvedValue([{ id: "p1", estado: "aprobado" }] as never);
    const res = await request(app)
      .post(ruta)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COMPRA_NO_CANCELABLE");
    expect(compraRepository.cancelar).not.toHaveBeenCalled();
  });
});

describe("POST /compras/:id/pagar sobre una compra cancelada", () => {
  it("responde 409 sin crear un intento de pago", async () => {
    jest
      .spyOn(compraRepository, "lockById")
      .mockResolvedValue(filaCompra({ estado: "cancelada" }) as never);
    const crear = jest.spyOn(pagoRepository, "crearPendiente");
    const res = await request(app)
      .post(`/api/v1/compras/${COMPRA_ID}/pagar`)
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(409);
    expect(crear).not.toHaveBeenCalled();
  });
});

describe("GET /compras/mis-compras", () => {
  it("excluye las compras canceladas en la consulta", async () => {
    const query = jest
      .spyOn(pool, "query")
      .mockResolvedValue({ rows: [] } as never);
    const res = await request(app)
      .get("/api/v1/compras/mis-compras")
      .set("Origin", ORIGIN)
      .set("Cookie", auth(COMPRADOR));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/c\.estado <> 'cancelada'/);
    expect(params).toEqual([COMPRADOR]);
  });
});
