"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
// Inicializar Express
const app = (0, express_1.default)();
// Middlewares de seguridad y utilidades
app.use((0, helmet_1.default)()); // Protege configurando cabeceras HTTP
app.use((0, cors_1.default)()); // Permite peticiones de otros dominios
app.use(express_1.default.json()); // Parsea requests entrantes con payloads JSON
app.use(express_1.default.urlencoded({ extended: true })); // Parsea payloads URL-encoded
// Rutas base de la API
app.use('/api/v1', routes_1.default);
// Manejador de ruta no encontrada (404)
app.use(error_middleware_1.notFoundHandler);
// Manejador de errores global
app.use(error_middleware_1.errorHandler);
exports.default = app;
