import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import pool from "../config/db.config";
import { emailSchema, passwordSchema } from "../schemas/auth.schema";
import { SALT_ROUNDS } from "../utils/password.util";
import { guardOrExit } from "./guard";
import { REFERENCE_DATA_SQL, RESET_SQL, SCHEMA_SQL } from "./init";

// Deja la base en cero: esquema vigente (incluye la versión en schema_migrations), datos de
// referencia y UN admin real. Sin usuarios ni datos de prueba. Todo en una sola transacción.

export interface DbTarget {
  host: string;
  database: string;
}

export interface AdminCredentials {
  email: string;
  password: string;
}

const CONFIRM_DB_FLAG = "--confirm-db=";

// Destino efectivo, con la misma precedencia que db.config: DATABASE_URL gana sobre DB_*.
// Nunca incluye credenciales.
export function resolveDbTarget(env: NodeJS.ProcessEnv = process.env): DbTarget {
  if (env.DATABASE_URL) {
    let url: URL;
    try {
      url = new URL(env.DATABASE_URL);
    } catch {
      throw new Error("DATABASE_URL no es una URL válida");
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!database) throw new Error("DATABASE_URL no indica el nombre de la base");
    return { host: url.port ? `${url.hostname}:${url.port}` : url.hostname, database };
  }

  const database = env.DB_NAME?.trim();
  if (!database) throw new Error("No se pudo determinar la base destino: falta DB_NAME o DATABASE_URL");
  const host = env.DB_HOST?.trim() || "localhost";
  return { host: `${host}:${env.DB_PORT?.trim() || "5432"}`, database };
}

export function assertConfirmDb(argv: string[], target: DbTarget): void {
  const arg = argv.find((a) => a.startsWith(CONFIRM_DB_FLAG));
  const confirmed = arg?.slice(CONFIRM_DB_FLAG.length);
  if (!confirmed) {
    throw new Error(
      `db:bootstrap borra TODA la base destino. Reintentá con ${CONFIRM_DB_FLAG}<nombre de la base> (npm run db:bootstrap -- --force ${CONFIRM_DB_FLAG}<nombre>)`,
    );
  }
  if (confirmed !== target.database) {
    throw new Error(
      `${CONFIRM_DB_FLAG}${confirmed} no coincide con la base destino (${target.database}); no se modificó nada`,
    );
  }
}

// Nunca incluye el valor de la contraseña en los mensajes de error.
export function readAdminCredentials(env: NodeJS.ProcessEnv = process.env): AdminCredentials {
  const rawEmail = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;

  const missing = [!rawEmail && "ADMIN_EMAIL", !password && "ADMIN_PASSWORD"].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(", ")}`);
  }

  const email = emailSchema.safeParse(rawEmail);
  const pass = passwordSchema.safeParse(password);
  const problemas = [
    ...(email.success ? [] : email.error.issues.map((i) => `ADMIN_EMAIL: ${i.message}`)),
    ...(pass.success ? [] : pass.error.issues.map((i) => `ADMIN_PASSWORD: ${i.message}`)),
  ];
  if (problemas.length > 0) throw new Error(problemas.join("; "));

  // Normalización idéntica a authService.register.
  return { email: (rawEmail as string).toLowerCase(), password: password as string };
}

// Reset + esquema + datos de referencia + admin en una transacción: si algo falla,
// la base queda como estaba.
export async function bootstrapDatabase(
  client: Pick<PoolClient, "query">,
  admin: { email: string; passwordHash: string },
): Promise<string> {
  // El DDL completo puede superar el statement_timeout de runtime (igual que init.ts).
  await client.query("SET statement_timeout = 0");
  await client.query("BEGIN");
  try {
    await client.query(RESET_SQL + SCHEMA_SQL + REFERENCE_DATA_SQL);
    const result = await client.query<{ id: string }>(
      `INSERT INTO usuarios (email, password_hash, rol_principal)
       VALUES ($1, $2, 'admin')
       RETURNING id`,
      [admin.email, admin.passwordHash],
    );
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const main = async () => {
  guardOrExit("db:bootstrap");
  let failed = false;
  try {
    const target = resolveDbTarget();
    console.log(`🎯 Base destino: ${target.database} en ${target.host}`);
    assertConfirmDb(process.argv, target);
    // Se valida y hashea antes de tocar la base: si falta algo, no se borra nada.
    const credentials = readAdminCredentials();
    const passwordHash = await bcrypt.hash(credentials.password, SALT_ROUNDS);

    console.log("🔄 Borrando la base y recreando esquema, datos de referencia y admin...");
    const client = await pool.connect();
    try {
      await bootstrapDatabase(client, { email: credentials.email, passwordHash });
    } finally {
      client.release();
    }
    console.log(`✅ Base inicializada. Admin creado: ${credentials.email}`);
  } catch (error) {
    console.error("❌ Error en db:bootstrap:", error instanceof Error ? error.message : error);
    failed = true;
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
};

if (require.main === module) {
  void main();
}
