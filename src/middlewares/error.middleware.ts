import { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../errors/app-error";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log interno completo (solo en servidor)
  console.error("💥 Error interceptado:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

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
