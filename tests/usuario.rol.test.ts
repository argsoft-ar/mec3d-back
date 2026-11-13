// Cambio de rol por autoservicio: el admin nunca se degrada y DELETE /usuarios/fabricante
// solo aplica a fabricantes (antes cualquier rol, incluido el admin, pasaba a comprador).
process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

const mockClient = { query: jest.fn() };
const mockUserRepo = {
  findById: jest.fn(),
  lockRolById: jest.fn(),
  tieneOrdenesActivas: jest.fn(),
  tieneMovimientosPendientes: jest.fn(),
  updateRol: jest.fn(),
  clearFabricanteRows: jest.fn(),
};

jest.mock("../src/utils/transaction.util", () => ({
  withTransaction: jest.fn((fn: (c: unknown) => unknown) => fn(mockClient)),
}));
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: mockUserRepo,
}));

import request from "supertest";
import app from "../src/app";
import { ORIGIN, sessionCookie } from "./helpers/session";
import { usuarioService } from "../src/services/usuario.service";
import type { TokenPayload } from "../src/interfaces/auth.interface";

jest.setTimeout(30_000);

const USER_ID = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const payload = (rolPrincipal: TokenPayload["rolPrincipal"]): TokenPayload => ({
  id: USER_ID,
  email: "ana@mec3d.com",
  rolPrincipal,
});

beforeEach(() => {
  Object.values(mockUserRepo).forEach((fn) => fn.mockReset());
  mockUserRepo.tieneOrdenesActivas.mockResolvedValue(false);
  mockUserRepo.tieneMovimientosPendientes.mockResolvedValue(false);
  mockUserRepo.updateRol.mockImplementation(async (id: string, rol: string) => ({
    id,
    email: "ana@mec3d.com",
    rol_principal: rol,
  }));
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("usuarioService.changeRol", () => {
  it.each(["comprador", "disenador", "fabricante"])(
    "admin -> %s: 403 y no escribe",
    async (rol) => {
      mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: "admin" });
      await expect(
        usuarioService.changeRol(USER_ID, rol),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockUserRepo.updateRol).not.toHaveBeenCalled();
      expect(mockUserRepo.clearFabricanteRows).not.toHaveBeenCalled();
    },
  );

  it("rolRequerido distinto del actual: 403 y no escribe", async () => {
    mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: "disenador" });
    await expect(
      usuarioService.changeRol(USER_ID, "comprador", {
        rolRequerido: "fabricante",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockUserRepo.updateRol).not.toHaveBeenCalled();
  });

  it("usuario común sigue pudiendo cambiar su rol", async () => {
    mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: "comprador" });
    await expect(
      usuarioService.changeRol(USER_ID, "fabricante"),
    ).resolves.toMatchObject({ rol_principal: "fabricante" });
    expect(mockUserRepo.updateRol).toHaveBeenCalledWith(
      USER_ID,
      "fabricante",
      mockClient,
    );
  });
});

describe("DELETE /usuarios/fabricante", () => {
  const borrar = (rol: TokenPayload["rolPrincipal"]) =>
    request(app)
      .delete("/api/v1/usuarios/fabricante")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(payload(rol)));

  it.each(["disenador", "comprador", "admin"] as const)(
    "rol %s en la DB: 403, sin cambio de rol ni cookie nueva",
    async (rol) => {
      mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: rol });
      const res = await borrar(rol);
      expect(res.status).toBe(403);
      expect(mockUserRepo.updateRol).not.toHaveBeenCalled();
      expect(res.headers["set-cookie"]).toBeUndefined();
    },
  );

  it("fabricante: pasa a comprador y renueva la cookie", async () => {
    mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: "fabricante" });
    const res = await borrar("fabricante");
    expect(res.status).toBe(200);
    expect(mockUserRepo.updateRol).toHaveBeenCalledWith(
      USER_ID,
      "comprador",
      mockClient,
    );
    expect(mockUserRepo.clearFabricanteRows).toHaveBeenCalled();
    expect(String(res.headers["set-cookie"])).toMatch(/mec3d_session=/);
  });
});

describe("PATCH /usuarios/rol", () => {
  it("una cuenta admin no puede degradarse por autoservicio (403)", async () => {
    mockUserRepo.lockRolById.mockResolvedValue({ rol_principal: "admin" });
    const res = await request(app)
      .patch("/api/v1/usuarios/rol")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(payload("admin")))
      .send({ rol: "fabricante" });
    expect(res.status).toBe(403);
    expect(mockUserRepo.updateRol).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});