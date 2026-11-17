// Helpers de sesión para tests HTTP: la auth viaja en la cookie mec3d_session y los métodos
// que modifican estado exigen un Origin permitido (CSRF). Importar DESPUÉS de setear JWT_SECRET.
import { generateToken } from "../../src/utils/jwt.util";
import { envConfig } from "../../src/config/env.config";
import { parseAllowedOrigins } from "../../src/utils/cors-origins.util";
import { SESSION_COOKIE_NAME } from "../../src/utils/session-cookie.util";
import type { TokenPayload } from "../../src/interfaces/auth.interface";

/** Primer origen de la allowlist (CORS_ORIGIN) vigente en el entorno de test. */
export const ORIGIN = parseAllowedOrigins(envConfig.cors.origin)[0];

/** Valor del header Cookie con un JWT de sesión válido. */
export const sessionCookie = (payload: TokenPayload): string =>
  `${SESSION_COOKIE_NAME}=${generateToken(payload)}`;
