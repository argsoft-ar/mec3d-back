import type { CookieOptions, Request, Response } from "express";
import { getTokenExpiresAtMs } from "./jwt.util";

export const SESSION_COOKIE_NAME = "mec3d_session";

// Atributos comunes a set y clear (clearCookie solo borra si coinciden path/domain/etc).
// Secure solo en producción para que http://localhost funcione en desarrollo.
export function sessionCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  };
}

/** Escribe la cookie de sesión con maxAge igual al tiempo restante del JWT. */
export function setSessionCookie(res: Response, token: string): void {
  const expiresAt = getTokenExpiresAtMs(token);
  const maxAge =
    expiresAt === null ? undefined : Math.max(0, expiresAt - Date.now());
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    ...(maxAge === undefined ? {} : { maxAge }),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

// Fallback si cookie-parser no está montado (p. ej. apps de test armadas a mano).
function leerCookieDelHeader(
  header: string,
  nombre: string,
): string | undefined {
  for (const parte of header.split(";")) {
    const idx = parte.indexOf("=");
    if (idx < 0) continue;
    if (parte.slice(0, idx).trim() !== nombre) continue;
    const valor = parte.slice(idx + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return undefined;
}

export function readSessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const parsed = cookies?.[SESSION_COOKIE_NAME];
  if (typeof parsed === "string" && parsed.length > 0) return parsed;
  const header = req.headers.cookie;
  if (cookies === undefined && typeof header === "string") {
    const valor = leerCookieDelHeader(header, SESSION_COOKIE_NAME);
    if (valor) return valor;
  }
  return undefined;
}
