import { enSecuencia } from "../src/utils/async.util";

describe("enSecuencia", () => {
  it("ejecuta de a uno, en orden, y devuelve los resultados en ese orden", async () => {
    const eventos: string[] = [];
    const resultado = await enSecuencia([30, 10, 20], async (ms, i) => {
      eventos.push(`inicio ${i}`);
      await new Promise((r) => setTimeout(r, ms));
      eventos.push(`fin ${i}`);
      return ms * 2;
    });
    expect(resultado).toEqual([60, 20, 40]);
    expect(eventos).toEqual([
      "inicio 0",
      "fin 0",
      "inicio 1",
      "fin 1",
      "inicio 2",
      "fin 2",
    ]);
  });

  it("devuelve [] sin items", async () => {
    await expect(enSecuencia([], async () => 1)).resolves.toEqual([]);
  });

  it("corta en el primer error y no ejecuta los siguientes", async () => {
    const fn = jest.fn(async (n: number) => {
      if (n === 2) throw new Error("falla");
      return n;
    });
    await expect(enSecuencia([1, 2, 3], fn)).rejects.toThrow("falla");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
