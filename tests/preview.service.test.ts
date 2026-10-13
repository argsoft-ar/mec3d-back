const mockSend = jest.fn();
jest.mock("../src/config/r2.config", () => ({
  __esModule: true,
  default: { send: (...args: unknown[]) => mockSend(...args) },
}));

const mockSetPreviewUrl = jest.fn();
const mockListarSinPreview = jest.fn();
const mockListarParaRegenerar = jest.fn();
jest.mock("../src/repositories/diseno.repository", () => ({
  disenoRepository: {
    setPreviewUrl: (...args: unknown[]) => mockSetPreviewUrl(...args),
    listarSinPreview: (...args: unknown[]) => mockListarSinPreview(...args),
    listarParaRegenerar: (...args: unknown[]) =>
      mockListarParaRegenerar(...args),
  },
}));

const mockWorker = jest.fn();
jest.mock("../src/utils/preview-worker.util", () => ({
  generarStlEnWorker: (...args: unknown[]) => mockWorker(...args),
}));

import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  previewService,
  PREVIEW_MAX_INPUT_BYTES,
  MAX_PENDIENTES_POR_USUARIO,
} from "../src/services/preview.service";

const ID = "4a2b8f0e-6c1a-4b7e-9d52-0a1b2c3d4e5f";
const ORIGINAL_KEY = "mec3d/modelos/abc-pieza.stl";
const ORIGINAL_URL = `https://cdn.test.example/${ORIGINAL_KEY}`;
const STL_DEGRADADO = new Uint8Array([1, 2, 3]);

function cuerpo(bytes: number, extra: Record<string, unknown> = {}) {
  return {
    Body: Readable.from([Buffer.alloc(bytes, 1)]),
    ContentLength: bytes,
    ...extra,
  };
}

// Responde según el comando: GET del original, PUT del preview, DELETE del huérfano.
function r2Ok(original?: unknown) {
  mockSend.mockImplementation(async (cmd: unknown) => {
    if (cmd instanceof GetObjectCommand) return original ?? cuerpo(16); // cuerpo nuevo por GET
    return {};
  });
}

const comandos = <T>(tipo: new (...a: never[]) => T) =>
  mockSend.mock.calls.map((c) => c[0]).filter((c): c is T => c instanceof tipo);

// Promesa controlable desde el test (evita depender de timers reales).
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

// Worker simulado que retiene cada ejecución hasta que el test la libera: el orden lo fijan
// las promesas (no el reloj), así que no depende de la carga de la máquina.
function workerControlado() {
  const inicios: ReturnType<typeof diferida<void>>[] = [];
  const salidas: ReturnType<typeof diferida<Uint8Array>>[] = [];
  const inicio = (i: number) => (inicios[i] ??= diferida<void>());
  const salida = (i: number) => (salidas[i] ??= diferida<Uint8Array>());
  const estado = { activos: 0, maximo: 0 };
  let llamada = 0;
  mockWorker.mockImplementation(async () => {
    const i = llamada++;
    estado.activos++;
    estado.maximo = Math.max(estado.maximo, estado.activos);
    inicio(i).resolver();
    const stl = await salida(i).promesa;
    estado.activos--;
    return stl;
  });
  return {
    estado,
    arranco: (i: number) => inicio(i).promesa,
    liberar: (i: number) => salida(i).resolver(STL_DEGRADADO),
  };
}

// Los tests de la cola encadenan varias promesas: margen amplio ante máquinas muy cargadas.
jest.setTimeout(30_000);

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  process.env.R2_PUBLIC_URL = "https://cdn.test.example";
  mockSend.mockReset();
  mockSetPreviewUrl.mockReset().mockResolvedValue(true);
  mockListarSinPreview.mockReset();
  mockListarParaRegenerar.mockReset();
  mockWorker.mockReset().mockResolvedValue(STL_DEGRADADO);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("previewService.generar", () => {
  it("descarga el original, genera el STL, lo sube bajo previews/ y guarda solo esa key", async () => {
    r2Ok();
    const ok = await previewService.generar(ID, ORIGINAL_URL);

    expect(ok).toBe(true);
    expect(comandos(GetObjectCommand)[0].input.Key).toBe(ORIGINAL_KEY);
    expect(mockWorker).toHaveBeenCalledWith(expect.any(Uint8Array), "stl");

    const put = comandos(PutObjectCommand)[0].input;
    expect(put.Key).toMatch(/^previews\/[0-9a-f-]{36}\.stl$/);
    expect(put.Body).toBe(STL_DEGRADADO);
    expect(put.ContentType).toBe("model/stl");

    expect(mockSetPreviewUrl).toHaveBeenCalledWith(
      ID,
      ORIGINAL_URL,
      put.Key,
      undefined,
    );
  });

  it.each(["obj", "3mf"])("acepta originales .%s", async (ext) => {
    r2Ok();
    const ok = await previewService.generar(
      ID,
      `https://cdn.test.example/mec3d/modelos/x.${ext}`,
    );
    expect(ok).toBe(true);
    expect(mockWorker).toHaveBeenCalledWith(expect.any(Uint8Array), ext);
  });

  it.each([
    ["STEP sin visor", `https://cdn.test.example/mec3d/modelos/x.step`],
    ["plano PDF", `https://cdn.test.example/mec3d/modelos/x.pdf`],
    ["URL externa", "https://storage.mec3d.com/files/engranaje.stl"],
  ])("omite %s sin tocar R2 ni la DB", async (_nombre, url) => {
    const ok = await previewService.generar(ID, url);
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSetPreviewUrl).not.toHaveBeenCalled();
  });

  it("rechaza por ContentLength sobre el tope sin leer el cuerpo ni lanzar el worker", async () => {
    r2Ok({
      Body: Readable.from([]),
      ContentLength: PREVIEW_MAX_INPUT_BYTES + 1,
    });
    expect(await previewService.generar(ID, ORIGINAL_URL)).toBe(false);
    expect(mockWorker).not.toHaveBeenCalled();
    expect(comandos(PutObjectCommand)).toHaveLength(0);
  });

  it("corta la descarga si el cuerpo real supera el tope aunque no declare tamaño", async () => {
    const grande = Readable.from(
      (function* () {
        for (let i = 0; i < 4; i++) yield Buffer.alloc(10 * 1024 * 1024);
      })(),
    );
    r2Ok({ Body: grande });
    expect(await previewService.generar(ID, ORIGINAL_URL)).toBe(false);
    expect(mockWorker).not.toHaveBeenCalled();
  });

  it("si el worker falla (malla inválida/timeout) no sube nada y no propaga el error", async () => {
    r2Ok();
    mockWorker.mockRejectedValue(new Error("Timeout generando el preview"));
    expect(await previewService.generar(ID, ORIGINAL_URL)).toBe(false);
    expect(comandos(PutObjectCommand)).toHaveLength(0);
    expect(mockSetPreviewUrl).not.toHaveBeenCalled();
  });

  it("si falla la descarga devuelve false sin lanzar", async () => {
    mockSend.mockRejectedValue(new Error("NoSuchKey"));
    await expect(previewService.generar(ID, ORIGINAL_URL)).resolves.toBe(false);
  });

  it("si el archivo cambió o ya hay preview (concurrencia), borra solo su propio objeto subido", async () => {
    r2Ok();
    mockSetPreviewUrl.mockResolvedValue(false);
    expect(await previewService.generar(ID, ORIGINAL_URL)).toBe(false);
    const subida = comandos(PutObjectCommand)[0].input.Key;
    const borrados = comandos(DeleteObjectCommand);
    expect(borrados).toHaveLength(1);
    expect(borrados[0].input.Key).toBe(subida);
  });

  it("si falla el guardado en DB borra el preview subido", async () => {
    r2Ok();
    mockSetPreviewUrl.mockRejectedValue(new Error("db caída"));
    expect(await previewService.generar(ID, ORIGINAL_URL)).toBe(false);
    expect(comandos(DeleteObjectCommand)).toHaveLength(1);
  });

  it("no loguea la key del original ni la del preview", async () => {
    r2Ok();
    mockWorker.mockRejectedValue(new Error(`falló ${ORIGINAL_KEY}`));
    await previewService.generar(ID, ORIGINAL_URL);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(ORIGINAL_KEY);
  });
});

describe("previewService.programar", () => {
  it("no bloquea ni rechaza aunque la generación falle", async () => {
    r2Ok();
    mockWorker.mockRejectedValue(new Error("boom"));
    await expect(
      previewService.programar(ID, ORIGINAL_URL),
    ).resolves.toBeUndefined();
  });

  it("ejecuta las generaciones de a una (sin paralelismo)", async () => {
    r2Ok();
    const w = workerControlado();
    const todas = Promise.all([
      previewService.programar(
        "00000000-0000-0000-0000-000000000001",
        ORIGINAL_URL,
      ),
      previewService.programar(
        "00000000-0000-0000-0000-000000000002",
        ORIGINAL_URL,
      ),
      previewService.programar(
        "00000000-0000-0000-0000-000000000003",
        ORIGINAL_URL,
      ),
    ]);

    // Cada generación sólo arranca cuando termina la anterior.
    await w.arranco(0);
    expect(mockWorker).toHaveBeenCalledTimes(1);
    w.liberar(0);
    await w.arranco(1);
    expect(mockWorker).toHaveBeenCalledTimes(2);
    w.liberar(1);
    await w.arranco(2);
    expect(mockWorker).toHaveBeenCalledTimes(3);
    w.liberar(2);
    await todas;

    expect(w.estado.maximo).toBe(1);
  });

  it("no reencola un diseño que ya está en cola o en curso con el mismo archivo", async () => {
    r2Ok();
    const w = workerControlado();

    const primera = previewService.programar(ID, ORIGINAL_URL);
    await w.arranco(0); // en curso
    await Promise.all([
      previewService.programar(ID, ORIGINAL_URL),
      previewService.programar(ID, ORIGINAL_URL),
    ]); // se resuelven de inmediato: no quedaron en la cola
    w.liberar(0);
    await primera;

    expect(mockWorker).toHaveBeenCalledTimes(1);
    expect(mockSetPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it("un fallo no deja al diseño bloqueado: tras terminar se puede volver a programar", async () => {
    r2Ok();
    mockWorker.mockRejectedValueOnce(new Error("boom"));
    await previewService.programar(ID, ORIGINAL_URL);
    await previewService.programar(ID, ORIGINAL_URL);
    expect(mockWorker).toHaveBeenCalledTimes(2);
  });

  it("si el archivo cambió mientras está en curso, encola la generación del archivo nuevo", async () => {
    r2Ok();
    const w = workerControlado();
    const nuevo = "https://cdn.test.example/mec3d/modelos/nuevo.stl";

    const primera = previewService.programar(ID, ORIGINAL_URL);
    await w.arranco(0);
    const segunda = previewService.programar(ID, nuevo);
    w.liberar(0);
    await w.arranco(1);
    w.liberar(1);
    await Promise.all([primera, segunda]);

    expect(mockWorker).toHaveBeenCalledTimes(2);
    expect(mockSetPreviewUrl).toHaveBeenLastCalledWith(
      ID,
      nuevo,
      expect.any(String),
      undefined,
    );
  });

  it("saltea la tarea que quedó obsoleta (el archivo vigente del diseño ya es otro)", async () => {
    r2Ok();
    const w = workerControlado();
    const B = "https://cdn.test.example/mec3d/modelos/b.stl";
    const C = "https://cdn.test.example/mec3d/modelos/c.stl";

    const p1 = previewService.programar(ID, ORIGINAL_URL);
    await w.arranco(0);
    const p2 = previewService.programar(ID, B);
    const p3 = previewService.programar(ID, C);
    w.liberar(0);
    await w.arranco(1);
    w.liberar(1);
    await Promise.all([p1, p2, p3]);

    expect(mockWorker).toHaveBeenCalledTimes(2); // B se salteó
    expect(mockSetPreviewUrl.mock.calls.map((c) => c[1])).toEqual([
      ORIGINAL_URL,
      C,
    ]);
  });

  it("alternar A→B→A→B no reencola: cada archivo se genera a lo sumo una vez", async () => {
    r2Ok();
    const w = workerControlado();
    const B = "https://cdn.test.example/mec3d/modelos/b.stl";

    const p1 = previewService.programar(ID, ORIGINAL_URL);
    await w.arranco(0);
    const p2 = previewService.programar(ID, B);
    await previewService.programar(ID, ORIGINAL_URL);
    await previewService.programar(ID, B);
    w.liberar(0);
    await w.arranco(1);
    w.liberar(1);
    await Promise.all([p1, p2]);

    expect(mockWorker).toHaveBeenCalledTimes(2);
    expect(mockSetPreviewUrl.mock.calls.map((c) => c[1])).toEqual([
      ORIGINAL_URL,
      B,
    ]);
  });

  it(`limita a ${MAX_PENDIENTES_POR_USUARIO} las generaciones pendientes por usuario y libera el cupo al terminar`, async () => {
    r2Ok();
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const w = workerControlado();
    const id = (n: number) =>
      `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;

    const deUsuario1 = [1, 2, 3, 4, 5].map((n) =>
      previewService.programar(id(n), ORIGINAL_URL, "user-1"),
    );
    const deUsuario2 = previewService.programar(id(6), ORIGINAL_URL, "user-2");

    // user-1: 3 aceptadas, 2 descartadas; user-2 no se ve afectado.
    for (let i = 0; i < MAX_PENDIENTES_POR_USUARIO + 1; i++) {
      await w.arranco(i);
      w.liberar(i);
    }
    await Promise.all([...deUsuario1, deUsuario2]);
    expect(mockWorker).toHaveBeenCalledTimes(MAX_PENDIENTES_POR_USUARIO + 1);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // El cupo se liberó: user-1 puede volver a encolar.
    const otra = previewService.programar(id(7), ORIGINAL_URL, "user-1");
    await w.arranco(MAX_PENDIENTES_POR_USUARIO + 1);
    w.liberar(MAX_PENDIENTES_POR_USUARIO + 1);
    await otra;
    expect(mockWorker).toHaveBeenCalledTimes(MAX_PENDIENTES_POR_USUARIO + 2);
    warnSpy.mockRestore();
  });

  it("sin userId (backfill/otros callers) no aplica el tope por usuario", async () => {
    r2Ok();
    const id = (n: number) =>
      `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) => previewService.programar(id(n), ORIGINAL_URL)),
    );
    expect(mockWorker).toHaveBeenCalledTimes(5);
  });
});

describe("previewService.generar con reemplazarDe (regenerar)", () => {
  const VIEJO = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";

  it("guarda el nuevo con reemplazarDe y borra el preview viejo solo después de guardar", async () => {
    r2Ok();
    expect(
      await previewService.generar(ID, ORIGINAL_URL, { reemplazarDe: VIEJO }),
    ).toBe(true);

    const nuevo = comandos(PutObjectCommand)[0].input.Key;
    expect(mockSetPreviewUrl).toHaveBeenCalledWith(
      ID,
      ORIGINAL_URL,
      nuevo,
      VIEJO,
    );
    const borrados = comandos(DeleteObjectCommand);
    expect(borrados).toHaveLength(1);
    expect(borrados[0].input.Key).toBe(VIEJO);
    const ordenBorrado =
      mockSend.mock.invocationCallOrder[
        mockSend.mock.calls.findIndex(
          (c) => c[0] instanceof DeleteObjectCommand,
        )
      ];
    expect(mockSetPreviewUrl.mock.invocationCallOrder[0]).toBeLessThan(
      ordenBorrado,
    );
  });

  it("si no se pudo reemplazar (cambió el preview/archivo) conserva el viejo y borra solo el nuevo", async () => {
    r2Ok();
    mockSetPreviewUrl.mockResolvedValue(false);
    expect(
      await previewService.generar(ID, ORIGINAL_URL, { reemplazarDe: VIEJO }),
    ).toBe(false);
    const nuevo = comandos(PutObjectCommand)[0].input.Key;
    expect(comandos(DeleteObjectCommand).map((c) => c.input.Key)).toEqual([
      nuevo,
    ]);
  });

  it("si falla la generación el preview viejo no se toca", async () => {
    r2Ok();
    mockWorker.mockRejectedValue(new Error("Timeout generando el preview"));
    expect(
      await previewService.generar(ID, ORIGINAL_URL, { reemplazarDe: VIEJO }),
    ).toBe(false);
    expect(comandos(DeleteObjectCommand)).toHaveLength(0);
  });
});

describe("previewService.descartar", () => {
  const KEY = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";

  it("solo borra claves de preview con el formato exacto", async () => {
    r2Ok();
    await previewService.descartar(ORIGINAL_KEY);
    await previewService.descartar(null);
    await previewService.descartar("previews/x.stl");
    await previewService.descartar("previews/../mec3d/modelos/a.stl");
    expect(mockSend).not.toHaveBeenCalled();
    await previewService.descartar(KEY);
    expect(comandos(DeleteObjectCommand)[0].input.Key).toBe(KEY);
  });
});

describe("previewService.backfill", () => {
  it("pagina por id, cuenta generados/omitidos y excluye planos desde la consulta", async () => {
    r2Ok();
    const A = "00000000-0000-0000-0000-00000000000a";
    const B = "00000000-0000-0000-0000-00000000000b";
    mockListarSinPreview
      .mockResolvedValueOnce([
        { id: A, archivo_url: ORIGINAL_URL },
        { id: B, archivo_url: "https://cdn.test.example/mec3d/modelos/x.step" },
      ])
      .mockResolvedValueOnce([]);

    const res = await previewService.backfill({ lote: 2 });

    expect(res).toEqual({ procesados: 2, generados: 1, omitidos: 1 });
    expect(mockListarSinPreview).toHaveBeenNthCalledWith(
      1,
      "00000000-0000-0000-0000-000000000000",
      2,
      "Planos técnicos",
    );
    expect(mockListarSinPreview).toHaveBeenNthCalledWith(
      2,
      B,
      2,
      "Planos técnicos",
    );
    expect(mockSetPreviewUrl).toHaveBeenCalledTimes(1);
  });

  it("con regenerar procesa también los que ya tienen preview y reemplaza el existente", async () => {
    r2Ok();
    const A = "00000000-0000-0000-0000-00000000000a";
    const B = "00000000-0000-0000-0000-00000000000b";
    const VIEJO = "previews/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f.stl";
    mockListarParaRegenerar
      .mockResolvedValueOnce([
        { id: A, archivo_url: ORIGINAL_URL, preview_url: VIEJO },
        { id: B, archivo_url: ORIGINAL_URL, preview_url: null },
      ])
      .mockResolvedValueOnce([]);

    const res = await previewService.backfill({ lote: 2, regenerar: true });

    expect(res).toEqual({ procesados: 2, generados: 2, omitidos: 0 });
    expect(mockListarSinPreview).not.toHaveBeenCalled();
    expect(mockListarParaRegenerar).toHaveBeenNthCalledWith(
      1,
      "00000000-0000-0000-0000-000000000000",
      2,
      "Planos técnicos",
    );
    expect(mockSetPreviewUrl.mock.calls.map((c) => [c[0], c[3]])).toEqual([
      [A, VIEJO],
      [B, undefined],
    ]);
    expect(comandos(DeleteObjectCommand).map((c) => c.input.Key)).toEqual([
      VIEJO,
    ]);
  });

  it("sin regenerar no usa el listado de regeneración ni pasa reemplazarDe", async () => {
    r2Ok();
    mockListarSinPreview
      .mockResolvedValueOnce([{ id: ID, archivo_url: ORIGINAL_URL }])
      .mockResolvedValueOnce([]);
    await previewService.backfill({ lote: 1 });
    expect(mockListarParaRegenerar).not.toHaveBeenCalled();
    expect(mockSetPreviewUrl.mock.calls[0][3]).toBeUndefined();
    expect(comandos(DeleteObjectCommand)).toHaveLength(0);
  });
});
