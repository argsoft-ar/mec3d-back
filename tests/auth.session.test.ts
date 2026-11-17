process.env.JWT_SECRET ??= "test-jwt-secret-para-tests";

const mockUserRepo = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createUser: jest.fn(),
  isUsernameTaken: jest.fn(),
};
jest.mock("../src/repositories/user.repository", () => ({
  userRepository: mockUserRepo,
}));

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import type { Request, Response } from "express";
import app from "../src/app";
import { ORIGIN, sessionCookie } from "./helpers/session";
import {
  generateSocketToken,
  generateToken,
  verifySocketToken,
  verifyToken,
} from "../src/utils/jwt.util";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../src/utils/session-cookie.util";
import { createCsrfProtection } from "../src/middlewares/csrf.middleware";
import { usuarioService } from "../src/services/usuario.service";
import { autenticarHandshake } from "../src/sockets/chat.socket";
import { parseTrustProxy } from "../src/config/env.config";
import { parseAllowedOrigins } from "../src/utils/cors-origins.util";
import type { TokenPayload } from "../src/interfaces/auth.interface";

jest.setTimeout(30_000);

const USER_ID = "5c2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const EMAIL = "ana@mec3d.com";
const PASSWORD = "Password123";
const PAYLOAD: TokenPayload = {
  id: USER_ID,
  email: EMAIL,
  rolPrincipal: "comprador",
};

const filaUsuario = {
  id: USER_ID,
  email: EMAIL,
  rol_principal: "comprador",
  zona_id: 7,
  cuenta_mercadopago: null,
  puntuacion: "0",
  username: "ana",
};
const userEsperado = {
  id: USER_ID,
  email: EMAIL,
  rolPrincipal: "comprador",
  zonaId: 7,
  cuentaMercadopago: null,
};

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  Object.values(mockUserRepo).forEach((fn) => fn.mockReset());
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const setCookies = (res: request.Response): string[] => {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw ?? [];
};
const cookieDeSesion = (res: request.Response): string | undefined =>
  setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
const tokenDeCookie = (cookie: string): string =>
  decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="));

describe("POST /auth/login", () => {
  const login = () =>
    request(app)
      .post("/api/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });

  it("setea la cookie de sesión y NO devuelve el token en el body", async () => {
    mockUserRepo.findByEmail.mockResolvedValue({
      ...filaUsuario,
      password_hash: passwordHash,
    });
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Login exitoso", user: userEsperado });
    expect(res.body).not.toHaveProperty("token");
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);

    const cookie = cookieDeSesion(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/; Secure/i); // fuera de producción

    // Max-Age = vencimiento del JWT
    const token = tokenDeCookie(cookie!);
    const { exp } = jwt.decode(token) as { exp: number };
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie!)?.[1]);
    expect(Math.abs(maxAge - (exp - Date.now() / 1000))).toBeLessThan(5);
    expect(verifyToken(token)).toEqual(PAYLOAD);
  });

  it("credenciales inválidas: 401 sin cookie", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    const res = await login();
    expect(res.status).toBe(401);
    expect(cookieDeSesion(res)).toBeUndefined();
  });

  it("CSRF: sin Origin ni Referer responde 403 sin tocar la DB", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(mockUserRepo.findByEmail).not.toHaveBeenCalled();
  });

  it("CSRF: Origin fuera de la allowlist responde 403", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("CSRF: sin Origin acepta un Referer del origen permitido", async () => {
    mockUserRepo.findByEmail.mockResolvedValue({
      ...filaUsuario,
      password_hash: passwordHash,
    });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Referer", `${ORIGIN}/login?next=/`)
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe("POST /auth/registro", () => {
  it("201 con el mismo body, sin token, y abre la sesión en la cookie", async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);
    mockUserRepo.isUsernameTaken.mockResolvedValue(false);
    mockUserRepo.createUser.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      username: "ana_perez",
      rol_principal: "comprador",
      zona_id: null,
      creado_en: "2026-01-01T00:00:00.000Z",
    });
    const res = await request(app)
      .post("/api/v1/auth/registro")
      .set("Origin", ORIGIN)
      .send({
        email: EMAIL,
        username: "ana_perez",
        password: PASSWORD,
        rolPrincipal: "comprador",
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: "Usuario registrado exitosamente",
      user: {
        id: USER_ID,
        email: EMAIL,
        username: "ana_perez",
        rolPrincipal: "comprador",
        zonaId: null,
        creadoEn: "2026-01-01T00:00:00.000Z",
      },
    });
    const cookie = cookieDeSesion(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(verifyToken(tokenDeCookie(cookie!))).toEqual(PAYLOAD);
  });
});

describe("authenticateToken (cookie) vía GET /auth/me", () => {
  it("200 con el mismo shape de user que el login", async () => {
    mockUserRepo.findById.mockResolvedValue(filaUsuario);
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie(PAYLOAD));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: userEsperado });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mockUserRepo.findById).toHaveBeenCalledWith(USER_ID);
  });

  it("401 sin cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("401 con Authorization: Bearer (ya no se acepta el header)", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${generateToken(PAYLOAD)}`);
    expect(res.status).toBe(401);
    expect(mockUserRepo.findById).not.toHaveBeenCalled();
  });

  it("401 con un token inválido o firmado con otro secreto", async () => {
    const ajeno = jwt.sign(PAYLOAD, "otro-secreto-cualquiera", {
      audience: "session",
    });
    for (const valor of ["basura", ajeno]) {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", `${SESSION_COOKIE_NAME}=${valor}`);
      expect(res.status).toBe(401);
    }
  });

  it("401 con un token de socket en la cookie (audiencia incorrecta)", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${generateSocketToken(PAYLOAD)}`);
    expect(res.status).toBe(401);
    expect(mockUserRepo.findById).not.toHaveBeenCalled();
  });

  it("401 si el usuario ya no existe", async () => {
    mockUserRepo.findById.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", sessionCookie(PAYLOAD));
    expect(res.status).toBe(401);
  });

  it("el token de socket solo lleva los claims propios (sin arrastrar los del token de sesión)", async () => {
    mockUserRepo.findById.mockResolvedValue(filaUsuario);
    const res = await request(app)
      .post("/api/v1/auth/socket-token")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(PAYLOAD));
    const decoded = jwt.decode(res.body.token) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(
      ["aud", "email", "exp", "iat", "id", "rolPrincipal"].sort(),
    );
  });
});

describe("POST /auth/logout", () => {
  it("204 y borra la cookie con los mismos atributos", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(PAYLOAD));
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    const cookie = cookieDeSesion(res);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).toMatch(/; Path=\//);
  });

  it("funciona aunque no haya sesión", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", ORIGIN);
    expect(res.status).toBe(204);
    expect(cookieDeSesion(res)).toBeDefined();
  });

  it("CSRF: sin Origin responde 403", async () => {
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(403);
  });
});

describe("POST /auth/socket-token", () => {
  it("exige sesión", async () => {
    const res = await request(app)
      .post("/api/v1/auth/socket-token")
      .set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });

  it("devuelve { token } de ~60 s con aud socket y el mismo id/rol", async () => {
    const res = await request(app)
      .post("/api/v1/auth/socket-token")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(PAYLOAD));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["token"]);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(cookieDeSesion(res)).toBeUndefined();

    const { token } = res.body as { token: string };
    const decoded = jwt.decode(token) as {
      aud: string;
      exp: number;
      iat: number;
    };
    expect(decoded.aud).toBe("socket");
    expect(decoded.exp - decoded.iat).toBe(60);
    expect(verifySocketToken(token)).toEqual(PAYLOAD);
    // No sirve como sesión HTTP
    expect(verifyToken(token)).toBeNull();
  });
});

describe("PATCH /usuarios/rol", () => {
  it("renueva la cookie con el rol nuevo y no devuelve token en el body", async () => {
    const fila = { id: USER_ID, rol_principal: "fabricante" };
    jest.spyOn(usuarioService, "changeRol").mockResolvedValue(fila);
    const res = await request(app)
      .patch("/api/v1/usuarios/rol")
      .set("Origin", ORIGIN)
      .set("Cookie", sessionCookie(PAYLOAD))
      .send({ rol: "fabricante" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fila);
    expect(res.body).not.toHaveProperty("token");
    const cookie = cookieDeSesion(res);
    expect(verifyToken(tokenDeCookie(cookie!))).toEqual({
      ...PAYLOAD,
      rolPrincipal: "fabricante",
    });
  });
});

describe("sessionCookieOptions", () => {
  it("Secure solo en producción", () => {
    expect(sessionCookieOptions("production")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(sessionCookieOptions("development").secure).toBe(false);
    expect(sessionCookieOptions(undefined).secure).toBe(false);
  });
});

describe("createCsrfProtection", () => {
  const csrf = createCsrfProtection({
    allowedOrigins: ["https://front.example.com"],
    exemptPathPrefixes: ["/api/v1/webhooks"],
  });

  const ejecutar = (
    method: string,
    headers: Record<string, string> = {},
    originalUrl = "/api/v1/compras",
  ) => {
    const req = { method, headers, originalUrl } as unknown as Request;
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json }),
    } as unknown as Response;
    const next = jest.fn();
    csrf(req, res, next);
    return {
      next,
      status: (res.status as jest.Mock).mock.calls[0]?.[0] as
        number | undefined,
    };
  };

  it.each(["GET", "HEAD", "OPTIONS"])("%s no se chequea", (m) => {
    expect(ejecutar(m).next).toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s sin Origin ni Referer: 403",
    (m) => {
      const r = ejecutar(m);
      expect(r.status).toBe(403);
      expect(r.next).not.toHaveBeenCalled();
    },
  );

  it("Origin permitido pasa; ajeno, 'null' o subdominio parecido no", () => {
    expect(
      ejecutar("POST", { origin: "https://front.example.com" }).next,
    ).toHaveBeenCalled();
    for (const origin of [
      "https://evil.example.com",
      "null",
      "https://front.example.com.evil.io",
      "http://front.example.com",
    ]) {
      expect(ejecutar("POST", { origin }).status).toBe(403);
    }
  });

  it("fallback al origen del Referer", () => {
    expect(
      ejecutar("DELETE", { referer: "https://front.example.com/a/b?c=1" }).next,
    ).toHaveBeenCalled();
    expect(
      ejecutar("DELETE", {
        referer: "https://evil.example.com/front.example.com",
      }).status,
    ).toBe(403);
    expect(ejecutar("DELETE", { referer: "no-es-url" }).status).toBe(403);
  });

  it("un Origin ajeno no se compensa con un Referer válido", () => {
    expect(
      ejecutar("POST", {
        origin: "https://evil.example.com",
        referer: "https://front.example.com/",
      }).status,
    ).toBe(403);
  });

  it("rutas server-to-server exentas (webhooks de Mercado Pago)", () => {
    expect(
      ejecutar("POST", {}, "/api/v1/webhooks/mercadopago?type=payment").next,
    ).toHaveBeenCalled();
    // el prefijo no matchea rutas parecidas
    expect(ejecutar("POST", {}, "/api/v1/webhooksx").status).toBe(403);
  });

  it("integrado en la app: el webhook de MP sin Origin no recibe 403", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .send({});
    expect(res.status).not.toBe(403);
  });
});

describe("socket.io: autenticarHandshake", () => {
  const handshake = (token: unknown) => {
    const socket = {
      handshake: { auth: { token } },
      data: {} as { user?: TokenPayload },
    };
    const next = jest.fn();
    autenticarHandshake(
      socket as unknown as Parameters<typeof autenticarHandshake>[0],
      next,
    );
    return { socket, next };
  };

  it("acepta un token de socket y expone el usuario", () => {
    const { socket, next } = handshake(generateSocketToken(PAYLOAD));
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual(PAYLOAD);
  });

  it("rechaza un token de sesión (sin aud socket)", () => {
    const { socket, next } = handshake(generateToken(PAYLOAD));
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data.user).toBeUndefined();
  });

  it("rechaza un token legado sin audiencia", () => {
    const legado = jwt.sign(PAYLOAD, process.env.JWT_SECRET as string, {
      expiresIn: "1d",
    });
    expect(handshake(legado).next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rechaza un token de socket vencido", () => {
    const vencido = jwt.sign(
      { ...PAYLOAD, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET as string,
      { audience: "socket" },
    );
    expect(handshake(vencido).next).toHaveBeenCalledWith(expect.any(Error));
  });

  it.each([undefined, "", 123])("rechaza auth.token = %p", (token) => {
    expect(handshake(token).next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("configuración", () => {
  it("parseTrustProxy", () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy("")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });

  it("parseAllowedOrigins descarta '*' y normaliza barras finales", () => {
    expect(
      parseAllowedOrigins(" https://a.example.com/ ,*, https://b.example.com"),
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });
});
