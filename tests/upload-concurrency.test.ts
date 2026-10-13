import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { createUploadConcurrencyLimiter } from "../src/middlewares/rate-limit.middleware";
import type { TooManyRequestsError } from "../src/errors/app-error";
import {
  DEFAULT_UPLOAD_MAX_CONCURRENT_GLOBAL,
  DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER,
  getUploadMaxConcurrentGlobal,
  getUploadMaxConcurrentPerUser,
} from "../src/utils/policy.util";

const req = (userId: string) => ({ user: { id: userId } }) as unknown as Request;
const res = () => new EventEmitter() as unknown as Response & EventEmitter;

// Devuelve el error pasado a next() (undefined si la request avanzó).
function entrar(
  limiter: ReturnType<typeof createUploadConcurrencyLimiter>,
  userId: string,
  response: Response,
): unknown {
  const next = jest.fn();
  limiter(req(userId), response, next);
  return next.mock.calls[0]?.[0];
}

describe("createUploadConcurrencyLimiter", () => {
  const limiter = () =>
    createUploadConcurrencyLimiter(() => ({ porUsuario: 2, global: 3 }));

  it("rechaza con 429 al superar el límite por usuario y libera con finish", () => {
    const l = limiter();
    const r1 = res();
    expect(entrar(l, "u1", r1)).toBeUndefined();
    expect(entrar(l, "u1", res())).toBeUndefined();

    const error = entrar(l, "u1", res());
    expect(error).toMatchObject({ statusCode: 429 });
    expect((error as TooManyRequestsError).statusCode).toBe(429);

    // Otro usuario no se ve afectado.
    expect(entrar(l, "u2", res())).toBeUndefined();

    r1.emit("finish");
    expect(entrar(l, "u1", res())).toBeUndefined();
  });

  it("aplica un tope global entre usuarios", () => {
    const l = limiter();
    expect(entrar(l, "a", res())).toBeUndefined();
    expect(entrar(l, "b", res())).toBeUndefined();
    expect(entrar(l, "c", res())).toBeUndefined();
    expect(entrar(l, "d", res())).toMatchObject({ statusCode: 429 });
  });

  it.each(["close", "error"])("libera el cupo con %s", (evento) => {
    const l = createUploadConcurrencyLimiter(() => ({ porUsuario: 1, global: 5 }));
    const r = res();
    expect(entrar(l, "u1", r)).toBeUndefined();
    expect(entrar(l, "u1", res())).toMatchObject({ statusCode: 429 });
    r.emit(evento);
    expect(entrar(l, "u1", res())).toBeUndefined();
  });

  it("no libera dos veces si llegan finish y close", () => {
    const l = createUploadConcurrencyLimiter(() => ({ porUsuario: 2, global: 5 }));
    const r1 = res();
    entrar(l, "u1", r1);
    entrar(l, "u1", res());
    r1.emit("finish");
    r1.emit("close");

    // Queda 1 cupo ocupado (la segunda request): entra una más y la siguiente se rechaza.
    expect(entrar(l, "u1", res())).toBeUndefined();
    expect(entrar(l, "u1", res())).toMatchObject({ statusCode: 429 });
  });
});

describe("límites de subidas simultáneas por env", () => {
  it("usa los defaults sin env o con valores inválidos", () => {
    expect(getUploadMaxConcurrentPerUser({} as NodeJS.ProcessEnv)).toBe(
      DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER,
    );
    expect(
      getUploadMaxConcurrentGlobal({
        UPLOAD_MAX_CONCURRENT_GLOBAL: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_UPLOAD_MAX_CONCURRENT_GLOBAL);
    expect(
      getUploadMaxConcurrentPerUser({
        UPLOAD_MAX_CONCURRENT_PER_USER: "abc",
      } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER);
  });

  it("respeta valores válidos", () => {
    expect(
      getUploadMaxConcurrentPerUser({
        UPLOAD_MAX_CONCURRENT_PER_USER: "4",
      } as NodeJS.ProcessEnv),
    ).toBe(4);
  });
});
