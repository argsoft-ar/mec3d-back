import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import "./types/express";
import { router } from "./routes";
import webhookRoutes from "./routes/webhook.routes";
import { envConfig } from "./config/env.config";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { apiLimiter } from "./middlewares/rate-limit.middleware";
import { swaggerSpec } from "./docs/swagger.config";

// Inicializar Express
const app: Application = express();

// Render (y cualquier PaaS) termina TLS en un proxy: sin esto req.ip es la IP del proxy y
// todos los clientes comparten el mismo bucket de rate limit.
app.set("trust proxy", 1);

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
// Webhooks públicos (Mercado Pago): ANTES del parser JSON global, con su propio limiter y
// límite de body. La firma no cubre el body, así que el parser JSON común alcanza (no se
// necesita raw body).
app.use("/api/v1/webhooks", webhookRoutes);

app.use(express.json()); // Parsea requests entrantes con payloads JSON
app.use(express.urlencoded({ extended: true })); // Parsea payloads URL-encoded

// Rate limiting global
app.use("/api/v1", apiLimiter);

// Documentación Swagger: no se publica en producción salvo ENABLE_DOCS=true
if (envConfig.enableDocs) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Rutas base de la API
app.use("/api/v1", router);

// Manejador de ruta no encontrada (404)
app.use(notFoundHandler);

// Manejador de errores global
app.use(errorHandler);

export default app;
