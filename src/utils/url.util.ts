// Quita las '/' finales recorriendo desde el final (sin regex: sin riesgo de backtracking).
export function quitarBarrasFinales(valor: string): string {
  let fin = valor.length;
  while (fin > 0 && valor.charCodeAt(fin - 1) === 47) fin--;
  return valor.slice(0, fin);
}
