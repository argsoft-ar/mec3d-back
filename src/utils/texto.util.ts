// Equivale a .replace(/<[^>]*>/g, "") en tiempo lineal: quita desde cada '<' hasta el primer '>'
// siguiente; un '<' sin '>' posterior se conserva junto con el resto del texto.
function quitarEtiquetas(s: string): string {
  let resultado = "";
  let i = 0;
  while (i < s.length) {
    const apertura = s.indexOf("<", i);
    if (apertura === -1) break;
    const cierre = s.indexOf(">", apertura + 1);
    if (cierre === -1) break;
    resultado += s.slice(i, apertura);
    i = cierre + 1;
  }
  return resultado + s.slice(i);
}

// Texto plano para notificaciones/mensajes de sistema: sin etiquetas HTML ni caracteres de control.
export function aTextoPlano(valor: string, max?: number): string {
  const limpio = quitarEtiquetas(valor)
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (max === undefined || limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).trimEnd()}…`;
}
