// Ejecuta fn sobre cada item de a uno, en orden, y devuelve los resultados en ese mismo orden.
// Para operaciones que no pueden correr en paralelo (p. ej. queries sobre un mismo cliente pg de
// una transacción). Si una falla, las siguientes no se ejecutan y se propaga el error.
export async function enSecuencia<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    (previo, item, index) =>
      previo.then(async (resultados) => {
        resultados.push(await fn(item, index));
        return resultados;
      }),
    Promise.resolve([]),
  );
}
