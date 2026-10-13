import pool from "../config/db.config";
import { REFERENCE_DATA_SQL } from "./init";
import { guardOrExit } from "./guard";

const truncateTables = async () => {
  guardOrExit("db:truncate");
  let failed = false;
  try {
    const { rows } = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> 'schema_migrations'
    `);

    if (rows.length === 0) {
      console.log("ℹ️  No hay tablas para truncar.");
      return;
    }

    const tableList = rows.map((r) => `"${r.table_name}"`).join(", ");
    console.log("🗑️  Truncando tablas...");
    // Se vacía todo (incluidos ledger y webhooks) y se restauran los datos de referencia:
    // sin configuracion_comisiones ni catálogo la app no puede cobrar ni listar.
    await pool.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
    await pool.query(REFERENCE_DATA_SQL);
    console.log("✅ Tablas vaciadas y datos de referencia restaurados");
  } catch (error) {
    console.error("❌ Error al truncar:", error);
    failed = true;
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
};

truncateTables();
