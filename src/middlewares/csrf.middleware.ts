import type { Request, RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfOptions {
  allowedOrigins: readonly string[];
  // Prefijos de ruta (sobre req.originalUrl) exentos: endpoints server-to-server sin navegador.
  exemptPathPrefixes?: readonly string[];
}

function origenDeReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/** Origen declarado por el navegador: Origin, o el origen del Referer como fallback. */
export function origenDeRequest(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "" && origin !== "null") {
    return origin;
  }
  return origenDeReferer(req.headers.referer);
}

// Defensa CSRF para la sesión en cookie: los métodos que modifican estado exigen que el
// Origin (o Referer) pertenezca a la allowlist de CORS. SameSite=Lax cubre la mayoría de los
// casos; esto agrega la verificación explícita (y protege el login contra login-CSRF).
export function createCsrfProtection(options: CsrfOptions): RequestHandler {
  const permitidos = new Set(options.allowedOrigins);
  const exentos = options.exemptPathPrefixes ?? [];

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }
    const path = req.originalUrl.split("?")[0];
    if (exentos.some((p) => path === p || path.startsWith(`${p}/`))) {
      next();
      return;
    }
    const origen = origenDeRequest(req);
    if (!origen || !permitidos.has(origen)) {
      res.status(403).json({ error: "Origen de la solicitud no permitido" });
      return;
    }
    next();
  };
}
