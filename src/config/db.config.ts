import { Pool } from "pg";
import { envConfig } from "./env.config";

const pool = envConfig.db.databaseUrl
  ? new Pool({
      connectionString: envConfig.db.databaseUrl,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: envConfig.db.host,
      port: Number(envConfig.db.port) || 5432,
      user: envConfig.db.user,
      password: envConfig.db.password,
      database: envConfig.db.name,
    });

pool.on("error", (err) => {
  console.error("❌ Error inesperado en el pool de PostgreSQL:", err);
  if (process.env.NODE_ENV !== "test") {
    process.exit(-1);
  }
});

export default pool;
