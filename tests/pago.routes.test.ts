process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";
process.env.MP_ACCESS_TOKEN = "TEST-token";
process.env.MP_WEBHOOK_SECRET = "secreto-webhook-de-prueba";
process.env.MP_NOTIFICATION_URL = "https://api.example.com/api/v1/webhooks/mercadopago";
process.env.FRONTEND_URL = "https://front.example.com";

const mockFindById = jest.fn();
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: { findById: (...args: unknown[]) => mockFindById(...args) },
}));

import request from "supertest";
import app from "../src/app";
import { generateToken } from "../src/utils/jwt.util";

const UUID = "3f2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";

// La primera request compila/carga toda la app: con suites en paralelo puede tardar más de 5 s.
jest.setTimeout(30_000);

const token = (rolPrincipal: "comprador" | "admin") =>
  generateToken({ id: UUID, email: "x@mec3d.com", rolPrincipal });

beforeEach(() => {
  mockFindById.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("POST /api/v1/webhooks/mercadopago", () => {
  it("es público pero rechaza con 401 si la firma es inválida", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago?data.id=123&type=payment")
      .set("x-signature", "ts=1,v1=abc")
      .set("x-request-id", "req-1")
      .send({ id: 1, type: "payment", data: { id: "123" } });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ resultado: "firma_invalida" });
  });

  it("sin headers de firma también es 401 (no 500)", async () => {
    const res = await request(app).post("/api/v1/webhooks/mercadopago").send({});
    expect(res.status).toBe(401);
  });
});

describe("endpoints de pago protegidos", () => {
  it.each([
    ["post", "/api/v1/compras"],
    ["post", `/api/v1/compras/${UUID}/pagar`],
    ["get", `/api/v1/compras/${UUID}/estado-pago`],
    ["get", "/api/v1/usuarios/mi-billetera"],
    ["post", `/api/v1/ordenes-fabricacion/${UUID}/cancelar`],
    ["get", "/api/v1/admin/payouts/pendientes"],
    ["post", `/api/v1/admin/payouts/${UUID}/marcar-pagado`],
    ["post", "/api/v1/admin/pagos/reembolsos-pendientes/reintentar"],
  ] as const)("%s %s exige token", async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta);
    expect(res.status).toBe(401);
  });
});

describe("endpoints admin", () => {
  it("un usuario no admin recibe 403", async () => {
    mockFindById.mockResolvedValue({ id: UUID, rol_principal: "comprador" });
    const res = await request(app)
      .get("/api/v1/admin/payouts/pendientes")
      .set("Authorization", `Bearer ${token("comprador")}`);
    expect(res.status).toBe(403);
  });

  it("el rol se relee de la DB: un JWT con rol admin ya revocado no alcanza", async () => {
    mockFindById.mockResolvedValue({ id: UUID, rol_principal: "comprador" });
    const res = await request(app)
      .post("/api/v1/admin/pagos/reembolsos-pendientes/reintentar")
      .set("Authorization", `Bearer ${token("admin")}`);
    expect(res.status).toBe(403);
  });

  it("valida el body antes de operar (admin)", async () => {
    mockFindById.mockResolvedValue({ id: UUID, rol_principal: "admin" });
    const res = await request(app)
      .post(`/api/v1/admin/payouts/${UUID}/marcar-pagado`)
      .set("Authorization", `Bearer ${token("admin")}`)
      .send({ referencia: "" });
    expect(res.status).toBe(400);
  });
});

describe("validación de entrada", () => {
  it("mi-billetera rechaza un estado inválido", async () => {
    const res = await request(app)
      .get("/api/v1/usuarios/mi-billetera?estado=liberado")
      .set("Authorization", `Bearer ${token("comprador")}`);
    expect(res.status).toBe(400);
  });

  it("estado-pago rechaza un id que no es UUID", async () => {
    const res = await request(app)
      .get("/api/v1/compras/no-uuid/estado-pago")
      .set("Authorization", `Bearer ${token("comprador")}`);
    expect(res.status).toBe(400);
  });
});
