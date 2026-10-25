import pool from "../config/db.config";
import { getReconciliationIntervalMs } from "../utils/policy.util";
import { ordenFabricacionService } from "../services/orden-fabricacion.service";
import { pagoService } from "../services/pago.service";

// Una sola instancia ejecuta el ciclo a la vez. Se usa el advisory lock de TRANSACCIÓN: se
// libera solo al terminar (o si se cae la conexión) y funciona detrás de un pooler en modo
// transacción (Neon/pgbouncer), donde un lock de sesión podría quedar en otra conexión.
const SCHEDULER_LOCK_KEY = 7_303_101;

export interface ResumenCiclo {
  reconciliacion: { revisadas: number; acreditados: number; errores: number } | null;
  reembolsos: {
    intentados: number;
    reembolsados: number;
    pendientes: number;
    conPayoutsPagados: number;
  } | null;
  entregasVencidas: number | null;
}

async function tarea<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    // Sin datos de usuarios: solo el nombre de la tarea y el mensaje.
    console.error(
      `❌ Scheduler (${nombre}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// Devuelve null si otra instancia tiene el lock.
export async function ejecutarCiclo(): Promise<ResumenCiclo | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock($1) AS locked",
      [SCHEDULER_LOCK_KEY],
    );
    if (!rows[0]?.locked) {
      await client.query("ROLLBACK");
      return null;
    }

    const resumen: ResumenCiclo = {
      reconciliacion: await tarea("reconciliar pagos", () =>
        pagoService.reconciliarPagosPendientes(),
      ),
      reembolsos: await tarea("reintentar reembolsos", () =>
        pagoService.reintentarReembolsosPendientes(),
      ),
      entregasVencidas: await tarea("entregas vencidas", () =>
        ordenFabricacionService.marcarEntregasVencidas(),
      ),
    };
    await client.query("COMMIT");

    const r = resumen.reconciliacion;
    const e = resumen.reembolsos;
    if (
      (r && (r.acreditados > 0 || r.errores > 0)) ||
      (e && e.intentados > 0) ||
      (resumen.entregasVencidas ?? 0) > 0
    ) {
      console.log(
        `⏱️  Scheduler: reconciliación revisadas=${r?.revisadas ?? "-"} acreditados=${r?.acreditados ?? "-"} errores=${r?.errores ?? "-"}; ` +
          `reembolsos intentados=${e?.intentados ?? "-"} ok=${e?.reembolsados ?? "-"} pendientes=${e?.pendientes ?? "-"} ` +
          `con_payouts_pagados=${e?.conPayoutsPagados ?? "-"}; entregas vencidas=${resumen.entregasVencidas ?? "-"}`,
      );
    }
    return resumen;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Activo en producción (o con RECONCILIATION_INTERVAL_MS explícita). El timer no mantiene vivo el proceso.
export function iniciarScheduler(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.Timeout | null {
  const intervalo = getReconciliationIntervalMs(env);
  if (intervalo === null) {
    console.log("⏱️  Scheduler de reconciliación desactivado");
    return null;
  }

  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) return;
    enCurso = true;
    ejecutarCiclo()
      .catch((error) =>
        console.error(
          "❌ Scheduler: ciclo fallido:",
          error instanceof Error ? error.message : error,
        ),
      )
      .finally(() => {
        enCurso = false;
      });
  }, intervalo);
  timer.unref();
  console.log(`⏱️  Scheduler de reconciliación activo (cada ${intervalo} ms)`);
  return timer;
}
