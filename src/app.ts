import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import "./types/express";
import { router } from "./routes";
import webhookRoutes from "./routes/webhook.routes";
import { envConfig } from "./config/env.config";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { apiLimiter } from "./middlewares/rate-limit.middleware";
import { createCsrfProtection } from "./middlewares/csrf.middleware";
import { swaggerSpec } from "./docs/swagger.config";
import { parseAllowedOrigins } from "./utils/cors-origins.util";

// Inicializar Express
const app: Application = express();

// Render (y cualquier PaaS) termina TLS en un proxy: sin esto req.ip es la IP del proxy y
// todos los clientes comparten el mismo bucket de rate limit. Configurable con TRUST_PROXY
// (ver env.config) para el salto extra del proxy /api/* de Vercel.
app.set("trust proxy", envConfig.trustProxy);

// Lista de orígenes permitidos (soporta múltiples separados por coma)
// Se eliminan slashes finales para evitar mismatch con el header Origin del browser
const allowedOrigins = parseAllowedOrigins(envConfig.cors.origin);

// Rutas server-to-server (sin navegador ni cookie): exentas del chequeo de Origin.
const CSRF_EXEMPT_PATHS = ["/api/v1/webhooks"];

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

app.use(cookieParser()); // Sesión en cookie HttpOnly (mec3d_session)
app.use(express.json()); // Parsea requests entrantes con payloads JSON
app.use(express.urlencoded({ extended: true })); // Parsea payloads URL-encoded

// CSRF: POST/PUT/PATCH/DELETE exigen Origin (o Referer) dentro de la allowlist de CORS
app.use(
  createCsrfProtection({
    allowedOrigins,
    exemptPathPrefixes: CSRF_EXEMPT_PATHS,
  }),
);

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
