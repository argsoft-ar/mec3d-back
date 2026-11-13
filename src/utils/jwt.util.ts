import jwt from "jsonwebtoken";
import { envConfig } from "../config/env.config";
import { TokenPayload } from "../interfaces/auth.interface";
import { RolUsuario } from "../interfaces/user.interface";

// Validar al importar - la app NO debe arrancar sin secret
const JWT_SECRET = envConfig.jwt.secret;
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET no está configurado. La aplicación no puede iniciar de forma segura.",
  );
}

const JWT_EXPIRES_IN = envConfig.jwt.expiresIn || "1d";
const ALGORITHM = "HS256";

// Cada token lleva una audiencia distinta: el de sesión (cookie HttpOnly) no sirve para el
// handshake del socket y el de socket (corta duración, legible por JS) no sirve como sesión HTTP.
export const SESSION_AUDIENCE = "session";
export const SOCKET_AUDIENCE = "socket";
export const SOCKET_TOKEN_EXPIRES_IN_SECONDS = 60;

const ROLES: readonly RolUsuario[] = [
  "comprador",
  "disenador",
  "fabricante",
  "admin",
];

function sign(
  payload: TokenPayload,
  audience: string,
  expiresIn: jwt.SignOptions["expiresIn"],
): string {
  // Solo los claims propios: req.user puede traer iat/exp/aud de un token previo.
  const claims: TokenPayload = {
    id: payload.id,
    email: payload.email,
    rolPrincipal: payload.rolPrincipal,
  };
  return jwt.sign(claims, JWT_SECRET as string, {
    expiresIn,
    audience,
    algorithm: ALGORITHM,
  });
}

function verify(token: string, audience: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string, {
      algorithms: [ALGORITHM],
      audience,
    });
    if (typeof decoded === "string") return null;
    const { id, email, rolPrincipal } = decoded as Partial<TokenPayload>;
    if (
      typeof id !== "string" ||
      typeof email !== "string" ||
      !ROLES.includes(rolPrincipal as RolUsuario)
    ) {
      return null;
    }
    return { id, email, rolPrincipal: rolPrincipal as RolUsuario };
  } catch {
    return null;
  }
}

/** Token de sesión (se entrega solo en la cookie HttpOnly). */
export const generateToken = (payload: TokenPayload): string =>
  sign(
    payload,
    SESSION_AUDIENCE,
    JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  );

/** Token efímero para el handshake de socket.io. */
export const generateSocketToken = (payload: TokenPayload): string =>
  sign(payload, SOCKET_AUDIENCE, SOCKET_TOKEN_EXPIRES_IN_SECONDS);

/** Verifica un token de sesión; rechaza tokens de otra audiencia (p. ej. socket). */
export const verifyToken = (token: string): TokenPayload | null =>
  verify(token, SESSION_AUDIENCE);

/** Verifica un token de socket; rechaza tokens de sesión. */
export const verifySocketToken = (token: string): TokenPayload | null =>
  verify(token, SOCKET_AUDIENCE);

/** Momento de expiración (epoch ms) de un token firmado por este módulo. */
export const getTokenExpiresAtMs = (token: string): number | null => {
  const decoded = jwt.decode(token);
  if (
    !decoded ||
    typeof decoded === "string" ||
    typeof decoded.exp !== "number"
  )
    return null;
  return decoded.exp * 1000;
};
