import dotenv from "dotenv";
import { z } from "zod";
import { AppError } from "../errors/app-error";

// Cargar variables de entorno de inmediato
dotenv.config();

// Exportar configuraciones
export const envConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    // Validación del certificado TLS: por defecto true. Solo se desactiva con "false" explícito.
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  },
  // Swagger público solo fuera de producción, o con ENABLE_DOCS=true.
  enableDocs:
    (process.env.NODE_ENV || "development") !== "production" ||
    process.env.ENABLE_DOCS === "true",
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
    publicUrl: process.env.R2_PUBLIC_URL,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
};

// ── Código de entrega (HMAC) ─────────────────────────────────────────────────
const MIN_DELIVERY_SECRET_LENGTH = 32;

export function getDeliveryCodeSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.DELIVERY_CODE_SECRET?.trim();
  if (!secret || secret.length < MIN_DELIVERY_SECRET_LENGTH) {
    console.error(
      `❌ DELIVERY_CODE_SECRET ausente o menor a ${MIN_DELIVERY_SECRET_LENGTH} caracteres`,
    );
    throw new AppError("El servicio de entregas no está disponible", 503);
  }
  return secret;
}

// Falla el arranque en producción; fuera de producción solo avisa.
export function validateDeliveryCodeEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const secret = env.DELIVERY_CODE_SECRET?.trim();
  if (secret && secret.length >= MIN_DELIVERY_SECRET_LENGTH) return;

  const message = `DELIVERY_CODE_SECRET ausente o menor a ${MIN_DELIVERY_SECRET_LENGTH} caracteres`;
  if (env.NODE_ENV === "production") {
    throw new Error(`FATAL: ${message}`);
  }
  console.warn(
    `⚠️  ${message}. El cierre de tratos de fabricación no funcionará.`,
  );
}

// ── Secretos en producción ───────────────────────────────────────────────────
const MIN_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_PREFIXES = ["tu_", "generar_", "changeme", "example"];
// Valores de ejemplo que alguna vez estuvieron en .env.example.
const PLACEHOLDER_VALUES = new Set([
  "tu_jwt_secret_aqui",
  "generar_con_openssl_rand_hex_32_32chars_min",
  "tu_clave_secreta_de_webhooks",
  "generar_con_openssl_rand_hex_32",
  "generar_con_openssl_rand_hex_32_jwt",
  "generar_con_openssl_rand_hex_32_delivery",
  "generar_con_openssl_rand_hex_32_webhook",
]);

export function esSecretoPlaceholder(valor: string): boolean {
  const v = valor.trim().toLowerCase();
  return (
    PLACEHOLDER_VALUES.has(v) ||
    PLACEHOLDER_PREFIXES.some((p) => v.startsWith(p))
  );
}

// En producción el servidor no arranca con secretos débiles o de ejemplo; fuera de
// producción solo se avisa. JWT_SECRET exige >= 32 caracteres; los otros dos solo
// se revisan contra placeholders (sus propios mínimos se validan en otro lado).
export function validateSecretsEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problemas: string[] = [];
  const jwt = env.JWT_SECRET?.trim() ?? "";
  if (jwt.length < MIN_JWT_SECRET_LENGTH) {
    problemas.push(
      `JWT_SECRET debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres`,
    );
  }
  for (const nombre of [
    "JWT_SECRET",
    "DELIVERY_CODE_SECRET",
    "MP_WEBHOOK_SECRET",
  ] as const) {
    const valor = env[nombre];
    if (valor && esSecretoPlaceholder(valor)) {
      problemas.push(`${nombre} usa un valor de ejemplo`);
    }
  }
  if (problemas.length === 0) return;

  const message = `Secretos inseguros: ${problemas.join("; ")}`;
  if (env.NODE_ENV === "production") {
    throw new Error(`FATAL: ${message}`);
  }
  console.warn(`⚠️  ${message}. Se exigirá en producción.`);
}

// ── Timeouts de la DB (por conexión) ─────────────────────────────────────────
export function getDbTimeouts(env: NodeJS.ProcessEnv = process.env): {
  statementTimeoutMs: number;
  lockTimeoutMs: number;
} {
  const leer = (raw: string | undefined, porDefecto: number) => {
    if (raw === undefined || raw.trim() === "") return porDefecto;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : porDefecto;
  };
  return {
    statementTimeoutMs: leer(env.DB_STATEMENT_TIMEOUT_MS, 15_000),
    lockTimeoutMs: leer(env.DB_LOCK_TIMEOUT_MS, 5_000),
  };
}

// ── Mercado Pago (Checkout Pro) ──────────────────────────────────────────────
// Se valida bajo demanda (no al importar): los scripts de DB y los tests importan
// esta config sin necesitar credenciales de pago.
const mercadoPagoEnvSchema = z.object({
  MP_ACCESS_TOKEN: z.string().trim().min(1),
  MP_WEBHOOK_SECRET: z.string().trim().min(16),
  MP_NOTIFICATION_URL: z.string().trim().url(),
  FRONTEND_URL: z.string().trim().url(),
});

export interface MercadoPagoSettings {
  accessToken: string;
  webhookSecret: string;
  notificationUrl: string;
  frontendUrl: string;
}

function parseMercadoPagoEnv(
  env: NodeJS.ProcessEnv,
): { settings: MercadoPagoSettings } | { invalidKeys: string[] } {
  const parsed = mercadoPagoEnvSchema.safeParse(env);
  if (!parsed.success) {
    const keys = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    return { invalidKeys: [...keys] };
  }

  const data = parsed.data;
  // En producción las URLs deben ser https: MP no entrega webhooks a http plano y
  // el redirect post-pago expondría los parámetros del pago.
  if (env.NODE_ENV === "production") {
    const insecure = (["MP_NOTIFICATION_URL", "FRONTEND_URL"] as const).filter(
      (k) => !data[k].startsWith("https://"),
    );
    if (insecure.length > 0) return { invalidKeys: insecure };
  }

  return {
    settings: {
      accessToken: data.MP_ACCESS_TOKEN,
      webhookSecret: data.MP_WEBHOOK_SECRET,
      notificationUrl: data.MP_NOTIFICATION_URL,
      frontendUrl: data.FRONTEND_URL.replace(/\/+$/, ""),
    },
  };
}

// Falla en el arranque de producción; fuera de producción solo avisa (los endpoints
// de pago responden 503 hasta que se configure).
export function validateMercadoPagoEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = parseMercadoPagoEnv(env);
  if ("settings" in result) return;

  const message = `Configuración de Mercado Pago inválida o ausente: ${result.invalidKeys.join(", ")}`;
  if (env.NODE_ENV === "production") {
    throw new Error(`FATAL: ${message}`);
  }
  console.warn(`⚠️  ${message}. Los endpoints de pago no estarán disponibles.`);
}

export function getMercadoPagoSettings(
  env: NodeJS.ProcessEnv = process.env,
): MercadoPagoSettings {
  const result = parseMercadoPagoEnv(env);
  if ("invalidKeys" in result) {
    console.error(
      `❌ Configuración de Mercado Pago inválida o ausente: ${result.invalidKeys.join(", ")}`,
    );
    throw new AppError("El servicio de pagos no está disponible", 503);
  }
  return result.settings;
}
