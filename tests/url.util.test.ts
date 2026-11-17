import { quitarBarrasFinales } from "../src/utils/url.util";

describe("quitarBarrasFinales", () => {
  it.each([
    ["", ""],
    ["/", ""],
    ["///", ""],
    ["https://x.com//", "https://x.com"],
    ["https://x.com/a/", "https://x.com/a"],
    ["https://x.com/a", "https://x.com/a"],
    ["sin-barra", "sin-barra"],
  ])("%j -> %j", (entrada, esperado) => {
    expect(quitarBarrasFinales(entrada)).toBe(esperado);
  });

  it("procesa en tiempo lineal muchas barras finales", () => {
    const inicio = Date.now();
    expect(quitarBarrasFinales(`a${"/".repeat(100_000)}`)).toBe("a");
    expect(Date.now() - inicio).toBeLessThan(1000);
  });
});
