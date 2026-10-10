import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { AppError, ValidationError } from "../errors/app-error";
import { mapPgError } from "../utils/pg-error.util";

// Errores de body-parser (JSON malformado, cuerpo demasiado grande): son del cliente, no 500.
export function mapBodyParserError(
  err: unknown,
): { status: number; message: string } | null {
  const type = (err as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !type.startsWith("entity.")) return null;
  if (type === "entity.too.large") {
    return { status: 413, message: "El cuerpo de la solicitud es demasiado grande" };
  }
  return { status: 400, message: "Cuerpo de la solicitud inválido" };
}

// Para rutas con su propio parser: responde sin log de stack ni detalles del parser.
export const bodyParseErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  const mapped = mapBodyParserError(err);
  if (!mapped) {
    next(err);
    return;
  }
  res.status(mapped.status).json({ error: mapped.message });
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const bodyError = mapBodyParserError(err);
  if (bodyError) {
    return res.status(bodyError.status).json({ error: bodyError.message });
  }

  // Log interno completo (solo en servidor)
  console.error("💥 Error interceptado:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Multer no lanza AppError para límites (ej. tamaño máximo excedido): se traduce a 400 explícitamente
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "El archivo excede el tamaño máximo permitido",
    });
  }

  // Si es un error operacional conocido (AppError)
  if (err instanceof AppError) {
    const response: { error: string; details?: unknown } = {
      error: err.message,
    };

    // Solo incluir detalles en errores de validación
    if (err instanceof ValidationError && err.details) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Violaciones de constraint / datos inválidos de PostgreSQL: 409/400 sin detalles internos
  const pgError = mapPgError(err);
  if (pgError) {
    return res.status(pgError.status).json({ error: pgError.message });
  }

  // Error desconocido - NUNCA exponer detalles al cliente
  res.status(500).json({
    error: "Error interno del servidor",
    // NO incluir message, stack, ni ningún detalle interno
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.path,
  });
};
