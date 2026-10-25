const workerCtor = jest.fn();
jest.mock("node:worker_threads", () => ({
  Worker: class {
    constructor(...args: unknown[]) {
      workerCtor(...args);
    }
    once() {
      return this;
    }
    terminate() {
      return Promise.resolve(0);
    }
  },
}));

import { generarStlEnWorker } from "../src/utils/preview-worker.util";

// El worker simulado nunca responde: timers falsos para que el timeout no retenga el proceso.
jest.useFakeTimers();

beforeEach(() => workerCtor.mockReset());

describe("generarStlEnWorker: transferencia de buffers", () => {
  it("transfiere el buffer del original cuando el view abarca todo el ArrayBuffer", () => {
    const datos = new Uint8Array(1024).fill(7);
    void generarStlEnWorker(datos, "stl", 60_000).catch(() => undefined);

    const opciones = workerCtor.mock.calls[0][1];
    expect(opciones.transferList).toEqual([datos.buffer]);
    expect(opciones.workerData.datos).toBe(datos);
  });

  it("copia antes de transferir si el view es parcial (p. ej. un Buffer del pool), sin tocar el original", () => {
    const grande = new Uint8Array(2048).fill(3);
    const parcial = grande.subarray(16, 1040);
    void generarStlEnWorker(parcial, "obj", 60_000).catch(() => undefined);

    const opciones = workerCtor.mock.calls[0][1];
    const enviado: Uint8Array = opciones.workerData.datos;
    expect(enviado).not.toBe(parcial);
    expect(enviado.byteLength).toBe(1024);
    expect(opciones.transferList).toEqual([enviado.buffer]);
    expect(opciones.transferList[0]).not.toBe(grande.buffer);
    expect(grande.buffer.byteLength).toBe(2048); // el buffer del caller sigue usable
  });
});
