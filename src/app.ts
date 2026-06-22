import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";

import router from "./routes";
import { envConfig } from "./config/env.config";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";

// Inicializar Express
const app: Application = express();

// Lista de orígenes permitidos (soporta múltiples separados por coma)
const allowedOrigins = envConfig.cors.origin.split(",").map((o) => o.trim());

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

// Rutas base de la API
app.use("/api/v1", router);

// Manejador de ruta no encontrada (404)
app.use(notFoundHandler);

// Manejador de errores global
app.use(errorHandler);

export default app;
