import { z } from "zod";

// ── Políticas de negocio configurables por env ───────────────────────────────
export const DEFAULT_PAYOUT_HOLD_DAYS = 14;
export const DEFAULT_DELIVERY_TIMEOUT_DAYS = 7;
export const CUENTA_COOLDOWN_HORAS = 24;

const HORA_MS = 60 * 60 * 1000;

function enteroNoNegativo(
  raw: string | undefined,
  porDefecto: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return porDefecto;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : porDefecto;
}

// Días que un payout de descarga queda retenido antes de poder pagarse al vendedor.
export function getPayoutHoldDays(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return enteroNoNegativo(env.PAYOUT_HOLD_DAYS, DEFAULT_PAYOUT_HOLD_DAYS, 365);
}

// Días tras los que una orden 'confirmada' sin completar pasa a revisión admin.
export function getDeliveryTimeoutDays(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const dias = enteroNoNegativo(
    env.DELIVERY_TIMEOUT_DAYS,
    DEFAULT_DELIVERY_TIMEOUT_DAYS,
    365,
  );
  return dias === 0 ? DEFAULT_DELIVERY_TIMEOUT_DAYS : dias;
}

// Subidas simultáneas en curso (cada una bufferiza hasta 10 MB en memoria).
export const DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER = 2;
export const DEFAULT_UPLOAD_MAX_CONCURRENT_GLOBAL = 10;

export function getUploadMaxConcurrentPerUser(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return (
    enteroNoNegativo(
      env.UPLOAD_MAX_CONCURRENT_PER_USER,
      DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER,
      100,
    ) || DEFAULT_UPLOAD_MAX_CONCURRENT_PER_USER
  );
}

export function getUploadMaxConcurrentGlobal(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return (
    enteroNoNegativo(
      env.UPLOAD_MAX_CONCURRENT_GLOBAL,
      DEFAULT_UPLOAD_MAX_CONCURRENT_GLOBAL,
      1000,
    ) || DEFAULT_UPLOAD_MAX_CONCURRENT_GLOBAL
  );
}

// ── Cuenta de Mercado Pago del vendedor ──────────────────────────────────────
// CBU/CVU: 22 dígitos. Alias: 6-20 caracteres [a-zA-Z0-9.-]. O un email.
const CBU_CVU_RE = /^\d{22}$/;
const ALIAS_RE = /^[a-zA-Z0-9.-]{6,20}$/;
const emailSchema = z.string().max(255).email();

export function esCuentaMercadopagoValida(valor: string): boolean {
  if (CBU_CVU_RE.test(valor) || ALIAS_RE.test(valor)) return true;
  return valor.includes("@") && emailSchema.safeParse(valor).success;
}

// Instante desde el que se puede pagar a la cuenta tras cambiarla; null si nunca cambió.
export function cuentaHabilitadaDesde(
  actualizadaEn: Date | string | null | undefined,
): Date | null {
  if (!actualizadaEn) return null;
  return new Date(
    new Date(actualizadaEn).getTime() + CUENTA_COOLDOWN_HORAS * HORA_MS,
  );
}

export function cuentaEnCooldown(
  actualizadaEn: Date | string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  const hasta = cuentaHabilitadaDesde(actualizadaEn);
  return hasta !== null && hasta.getTime() > ahora.getTime();
}

export function enRetencion(
  liberableDesde: Date | string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  return (
    !!liberableDesde && new Date(liberableDesde).getTime() > ahora.getTime()
  );
}

// ── Scheduler de reconciliación ──────────────────────────────────────────────
export const DEFAULT_RECONCILIATION_INTERVAL_MS = 300_000;
const MIN_RECONCILIATION_INTERVAL_MS = 10_000;

// null = desactivado. Fuera de producción solo corre con RECONCILIATION_INTERVAL_MS explícita;
// con "0" se desactiva también en producción.
export function getReconciliationIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env.RECONCILIATION_INTERVAL_MS?.trim();
  const explicita = raw !== undefined && raw !== "";
  if (!explicita && env.NODE_ENV !== "production") return null;
  if (!explicita) return DEFAULT_RECONCILIATION_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.max(n, MIN_RECONCILIATION_INTERVAL_MS);
}
