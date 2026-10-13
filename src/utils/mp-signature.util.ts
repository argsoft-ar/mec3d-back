import crypto from "crypto";

export type MotivoFirmaInvalida =
  | "firma_ausente"
  | "request_id_ausente"
  | "data_id_ausente"
  | "firma_malformada"
  | "firma_incorrecta"
  | "timestamp_vencido";

export type ResultadoFirma =
  | { valida: true }
  | { valida: false; motivo: MotivoFirmaInvalida };

export interface VerificarFirmaParams {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
  // Inyectables para tests.
  ahoraMs?: number;
  toleranciaMs?: number;
}

export const TOLERANCIA_FIRMA_MS = 5 * 60 * 1000;

// Mercado Pago envía el ts en milisegundos; si viniera en segundos se normaliza.
function tsAMs(ts: string): number {
  const n = Number(ts);
  return n < 100_000_000_000 ? n * 1000 : n;
}

function parseXSignature(header: string): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {};
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") out.ts = value;
    else if (key === "v1") out.v1 = value;
  }
  return out;
}

// Manifest documentado por Mercado Pago: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// (data.id en minúsculas cuando es alfanumérico).
export function verificarFirmaMercadoPago(
  params: VerificarFirmaParams,
): ResultadoFirma {
  const { xSignature, xRequestId, dataId, secret } = params;

  if (!xSignature) return { valida: false, motivo: "firma_ausente" };
  if (!xRequestId) return { valida: false, motivo: "request_id_ausente" };
  if (!dataId) return { valida: false, motivo: "data_id_ausente" };

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(v1)) {
    return { valida: false, motivo: "firma_malformada" };
  }

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const esperado = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const recibidoBuf = Buffer.from(v1.toLowerCase(), "utf8");
  const esperadoBuf = Buffer.from(esperado, "utf8");
  const coincide =
    recibidoBuf.length === esperadoBuf.length &&
    crypto.timingSafeEqual(recibidoBuf, esperadoBuf);
  if (!coincide) return { valida: false, motivo: "firma_incorrecta" };

  // El timestamp se chequea después de la firma: solo cuenta si fue firmado por MP.
  const ahora = params.ahoraMs ?? Date.now();
  const tolerancia = params.toleranciaMs ?? TOLERANCIA_FIRMA_MS;
  if (Math.abs(ahora - tsAMs(ts)) > tolerancia) {
    return { valida: false, motivo: "timestamp_vencido" };
  }

  return { valida: true };
}
