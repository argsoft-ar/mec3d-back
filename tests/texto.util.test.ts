import { aTextoPlano } from "../src/utils/texto.util";

describe("aTextoPlano", () => {
  // Implementación anterior (regex): referencia para verificar que el recorrido lineal da lo mismo.
  const referencia = (valor: string, max?: number): string => {
    const limpio = valor
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (max === undefined || limpio.length <= max) return limpio;
    return `${limpio.slice(0, max - 1).trimEnd()}…`;
  };

  it.each([
    ["<b>hola</b> mundo", "hola mundo"],
    ["a<b<c>d", "ad"],
    ["sin etiquetas", "sin etiquetas"],
    ["abierta < sin cierre", "abierta sin cierre"],
    ["x <i>y</i> < z", "x y z"],
    ["> suelto <a>b", "suelto b"],
    ["<>vacía", "vacía"],
    ["", ""],
  ])("%j -> %j", (entrada, esperado) => {
    expect(aTextoPlano(entrada)).toBe(esperado);
    expect(aTextoPlano(entrada)).toBe(referencia(entrada));
  });

  it("trunca con elipsis igual que antes", () => {
    const valor = "<p>Diseño de prueba</p>   con   espacios";
    expect(aTextoPlano(valor, 10)).toBe(referencia(valor, 10));
  });

  it("procesa en tiempo lineal muchos '<' sin cierre", () => {
    const valor = "<".repeat(100_000);
    const inicio = Date.now();
    expect(aTextoPlano(valor)).toBe("");
    expect(Date.now() - inicio).toBeLessThan(1000);
  });
});
