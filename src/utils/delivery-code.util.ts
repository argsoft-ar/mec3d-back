import crypto from "crypto";

export const MAX_INTENTOS_CODIGO = 5;

export function generarCodigoEntrega(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// HMAC-SHA256 (hex) del código ligado a la orden: el mismo código en otra orden da otro
// hash, y sin el secreto del servidor no se puede recalcular ni siquiera con acceso a la DB.
export function hashCodigoEntrega(
  ordenId: string,
  codigo: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${ordenId}:${codigo}`)
    .digest("hex");
}

// Comparación en tiempo constante. Un hash ausente (orden legada o sin código) nunca coincide.
export function verificarCodigoEntrega(
  ordenId: string,
  codigo: string,
  hashAlmacenado: string | null | undefined,
  secret: string,
): boolean {
  if (!hashAlmacenado) return false;
  const esperado = Buffer.from(hashAlmacenado, "hex");
  const calculado = Buffer.from(hashCodigoEntrega(ordenId, codigo, secret), "hex");
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}
