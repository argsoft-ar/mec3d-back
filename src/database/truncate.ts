import pool from "../config/db.config";

const truncateTables = async () => {
  try {
    const { rows } = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    if (rows.length === 0) {
      console.log("ℹ️  No hay tablas para truncar.");
      return;
    }

    const tableList = rows.map((r) => `"${r.table_name}"`).join(", ");
    console.log("🗑️  Truncando tablas...");
    await pool.query(`TRUNCATE ${tableList} CASCADE`);
    console.log("✅ Tablas vaciadas correctamente");
  } catch (error) {
    console.error("❌ Error al truncar:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

truncateTables();
