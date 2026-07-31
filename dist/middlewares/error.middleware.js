"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = void 0;
const app_error_1 = require("../errors/app-error");
const errorHandler = (err, req, res, next) => {
    // Log interno completo (solo en servidor)
    console.error('💥 Error interceptado:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });
    // Si es un error operacional conocido (AppError)
    if (err instanceof app_error_1.AppError) {
        const response = {
            error: err.message
        };
        // Solo incluir detalles en errores de validación
        if (err instanceof app_error_1.ValidationError && err.details) {
            response.details = err.details;
        }
        return res.status(err.statusCode).json(response);
    }
    // Error desconocido - NUNCA exponer detalles al cliente
    res.status(500).json({
        error: 'Error interno del servidor'
        // NO incluir message, stack, ni ningún detalle interno
    });
};
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.path
    });
};
exports.notFoundHandler = notFoundHandler;
