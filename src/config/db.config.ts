import { Pool } from "pg";
import { envConfig, getDbTimeouts } from "./env.config";

if (envConfig.nodeEnv === "production" && !envConfig.db.sslRejectUnauthorized) {
  throw new Error(
    "FATAL: DB_SSL_REJECT_UNAUTHORIZED=false no está permitido en producción.",
  );
}

const pool = envConfig.db.databaseUrl
  ? new Pool({
      connectionString: envConfig.db.databaseUrl,
      // Validación del certificado siempre activa salvo DB_SSL_REJECT_UNAUTHORIZED=false (solo dev).
      ssl: { rejectUnauthorized: envConfig.db.sslRejectUnauthorized },
    })
  : new Pool({
      host: envConfig.db.host,
      port: Number(envConfig.db.port) || 5432,
      user: envConfig.db.user,
      password: envConfig.db.password,
      database: envConfig.db.name,
    });

pool.on("error", (err) => {
  // Error de un cliente ocioso (ej. la DB cerró la conexión): el pool descarta ese cliente y
  // crea otro al próximo checkout. Matar el proceso cortaría todas las requests en curso.
  console.error("❌ Error inesperado en el pool de PostgreSQL:", err.message);
});

// Timeouts por conexión: ninguna query ni espera de lock puede colgar un request indefinidamente.
// Se fijan con SET (no con opciones de arranque) para funcionar detrás de poolers como pgbouncer.
const { statementTimeoutMs, lockTimeoutMs } = getDbTimeouts();
pool.on("connect", (client) => {
  client
    .query(
      `SET statement_timeout = ${statementTimeoutMs}; SET lock_timeout = ${lockTimeoutMs};`,
    )
    .catch((err: Error) => {
      console.error(
        "❌ No se pudieron fijar los timeouts de la conexión:",
        err.message,
      );
    });
});

export default pool;
