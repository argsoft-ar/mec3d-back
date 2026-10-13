import pool from "../config/db.config";
import { SCHEMA_SQL, REFERENCE_DATA_SQL } from "./init";
import { MIGRATIONS, SCHEMA_MIGRATIONS_DDL, USERNAME_LOWER_INDEX_SQL } from "./migrations";

// Bootstrap no destructivo que corre el deploy, con versionado en schema_migrations:
//   - DB vacía          -> crea el esquema completo (init.ts ya registra todas las versiones).
//   - DB sin versionado -> si tiene el esquema base (ledger + código HMAC) lo toma como v1;
//                          si es anterior aborta: hay que recrearla con `npm run db:init -- --force`.
//   - DB versionada     -> aplica en orden las migraciones idempotentes que falten.
// Siempre reaplica los datos de referencia (idempotente). Un advisory lock de transacción
// serializa deploys concurrentes.
const MIGRATE_LOCK_KEY = 7_303_002;

const migrate = async () => {
  const client = await pool.connect();
  client.on("notice", (n) => console.warn(`⚠️ ${n.message}`));
  let failed = false;
  try {
    // Las migraciones pueden tardar más que el statement_timeout de runtime.
    await client.query("SET statement_timeout = 0");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATE_LOCK_KEY]);

    const { rows } = await client.query<{
      usuarios: string | null;
      movimientos: string | null;
      tiene_intentos: boolean;
    }>(
      `SELECT to_regclass('public.usuarios') AS usuarios,
              to_regclass('public.movimientos') AS movimientos,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'ordenes_fabricacion'
                  AND column_name = 'intentos_codigo'
              ) AS tiene_intentos`,
    );
    const { usuarios, movimientos, tiene_intentos: tieneIntentos } = rows[0];

    if (usuarios === null) {
      console.log("🔄 Base vacía: creando esquema...");
      await client.query(SCHEMA_SQL);
    } else {
      if (movimientos === null || !tieneIntentos) {
        throw new Error(
          "El esquema existente es anterior al ledger de pagos o al código de entrega con HMAC. " +
            "Recrealo con `npm run db:init -- --force` (borra todos los datos, no permitido en producción).",
        );
      }

      await client.query(SCHEMA_MIGRATIONS_DDL);
      const aplicadas = await client.query<{ version: number }>(
        "SELECT version FROM schema_migrations",
      );
      const versiones = new Set(aplicadas.rows.map((r) => r.version));

      for (const m of MIGRATIONS) {
        if (versiones.has(m.version)) continue;
        console.log(`🔄 Aplicando migración ${m.version} (${m.nombre})...`);
        if (m.sql) await client.query(m.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, nombre) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
          [m.version, m.nombre],
        );
      }
    }

    await client.query(REFERENCE_DATA_SQL);
    await client.query(USERNAME_LOWER_INDEX_SQL);
    await client.query("COMMIT");
    console.log("✅ Base de datos lista");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("❌ Error en migración:", error);
    failed = true;
  } finally {
    client.release();
    await pool.end();
  }
  if (failed) process.exit(1);
};

void migrate();
