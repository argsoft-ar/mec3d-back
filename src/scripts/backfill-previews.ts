import pool from "../config/db.config";
import { previewService } from "../services/preview.service";

// Backfill idempotente: genera el preview 3D degradado de los diseños activos sin preview_url
// (excluye planos técnicos). Re-ejecutarlo solo reintenta los que siguen en NULL.
// Con --force procesa también los que ya tienen preview y lo reemplaza (borra el viejo tras guardar el nuevo).
const regenerar = process.argv.includes("--force");

const run = async () => {
  let failed = false;
  try {
    const { procesados, generados, omitidos } = await previewService.backfill({
      regenerar,
      log: (msg) => console.log(msg),
    });
    console.log(
      `✅ Backfill terminado: ${procesados} procesados, ${generados} generados, ${omitidos} omitidos`,
    );
  } catch (error) {
    console.error(
      "❌ Error en el backfill de previews:",
      error instanceof Error ? error.message : error,
    );
    failed = true;
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
};

run();
