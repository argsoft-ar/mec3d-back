// Texto plano para notificaciones/mensajes de sistema: sin etiquetas HTML ni caracteres de control.
export function aTextoPlano(valor: string, max?: number): string {
  const limpio = valor
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (max === undefined || limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trimEnd()}…`;
}
