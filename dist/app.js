"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const routes_1 = __importDefault(require("./routes"));
const env_config_1 = require("./config/env.config");
const error_middleware_1 = require("./middlewares/error.middleware");
const rate_limit_middleware_1 = require("./middlewares/rate-limit.middleware");
const swagger_config_1 = require("./docs/swagger.config");
// Inicializar Express
const app = (0, express_1.default)();
// Lista de orígenes permitidos (soporta múltiples separados por coma)
// Se eliminan slashes finales para evitar mismatch con el header Origin del browser
const allowedOrigins = env_config_1.envConfig.cors.origin
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""));
// Middlewares de seguridad y utilidades
app.use((0, helmet_1.default)()); // Protege configurando cabeceras HTTP
app.use((0, cors_1.default)({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
}));
app.use(express_1.default.json()); // Parsea requests entrantes con payloads JSON
app.use(express_1.default.urlencoded({ extended: true })); // Parsea payloads URL-encoded
// Rate limiting global
app.use("/api/v1", rate_limit_middleware_1.apiLimiter);
// Documentación Swagger
app.use("/api/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_config_1.swaggerSpec));
// Rutas base de la API
app.use("/api/v1", routes_1.default);
// Manejador de ruta no encontrada (404)
app.use(error_middleware_1.notFoundHandler);
// Manejador de errores global
app.use(error_middleware_1.errorHandler);
exports.default = app;
