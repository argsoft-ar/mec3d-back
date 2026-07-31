import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import "./types/express";
import router from "./routes";
import { envConfig } from "./config/env.config";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { apiLimiter } from "./middlewares/rate-limit.middleware";
import { swaggerSpec } from "./docs/swagger.config";

// Inicializar Express
const app: Application = express();

// Lista de orígenes permitidos (soporta múltiples separados por coma)
// Se eliminan slashes finales para evitar mismatch con el header Origin del browser
const allowedOrigins = envConfig.cors.origin
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""));

// Middlewares de seguridad y utilidades
app.use(helmet()); // Protege configurando cabeceras HTTP
app.use(
  cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json()); // Parsea requests entrantes con payloads JSON
app.use(express.urlencoded({ extended: true })); // Parsea payloads URL-encoded

// Rate limiting global
app.use("/api/v1", apiLimiter);

// Documentación Swagger
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rutas base de la API
app.use("/api/v1", router);

// Manejador de ruta no encontrada (404)
app.use(notFoundHandler);

// Manejador de errores global
app.use(errorHandler);

export default app;
