// Todo el dinero se calcula y persiste en centavos enteros; los pesos solo existen en
// los bordes (columnas NUMERIC heredadas, API de Mercado Pago y respuestas legibles).
export const MAX_MONTO_PESOS = 10_000_000;
export const MAX_MONTO_CENTAVOS = MAX_MONTO_PESOS * 100;

// Acepta number (hasta 2 decimales) o el string que devuelve pg para NUMERIC ("1500.00").
export function pesosACentavos(value: number | string): number {
  let centavos: number;

  if (typeof value === "string") {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) {
      throw new Error(`Monto inválido: "${value}"`);
    }
    centavos = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  } else {
    centavos = Math.round(value * 100);
    if (!Number.isFinite(value) || Math.abs(value * 100 - centavos) > 1e-6) {
      throw new Error(`Monto inválido: ${value}`);
    }
  }

  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new Error("Monto fuera de rango");
  }
  return centavos;
}

export function centavosAPesos(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

// pg devuelve BIGINT y SUM() como string: se normaliza a number validando que sea entero seguro.
export function toCentavos(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Valor de centavos inválido: ${String(value)}`);
  }
  return n;
}
