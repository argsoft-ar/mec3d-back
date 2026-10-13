// Errores de PostgreSQL (SQLSTATE) que no deben llegar al cliente como 500 ni con detalles.
// El mensaje es genérico a propósito: nunca incluye constraint, columna, tabla ni valores.
const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  "23505": {
    status: 409,
    message: "El recurso ya existe o entra en conflicto con otro",
  },
  "23503": {
    status: 409,
    message: "La operación referencia o depende de otro recurso",
  },
  "22003": { status: 400, message: "Un valor numérico está fuera de rango" },
  "22001": { status: 400, message: "Un valor excede la longitud permitida" },
  "22P02": { status: 400, message: "Formato de dato inválido" },
  "23514": {
    status: 400,
    message: "Un valor no cumple las reglas de validación",
  },
};

export function mapPgError(
  err: unknown,
): { status: number; message: string } | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return null;
  return PG_ERROR_MAP[code] ?? null;
}
