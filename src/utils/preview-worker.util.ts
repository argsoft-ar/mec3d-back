import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ExtensionPreview } from "./mesh-preview.util";

export const PREVIEW_TIMEOUT_MS = 30_000;
// Por debajo de la RAM de una instancia chica (256-512 MB): los typed arrays y buffers viven
// fuera del heap de V8, así que el tope de heap cubre strings/estructuras y el resto es el input.
const WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 192,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 2,
};

// Genera el STL degradado en un worker con timeout y tope de heap, para no bloquear el event
// loop ni dejar que un archivo hostil agote la memoria del proceso. El buffer de `datos` se
// TRANSFIERE al worker (queda inutilizable para el caller); un view parcial o de un pool se copia antes.
export function generarStlEnWorker(
  datos: Uint8Array,
  extension: ExtensionPreview,
  timeoutMs: number = PREVIEW_TIMEOUT_MS,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const transferible =
      datos.buffer instanceof ArrayBuffer &&
      datos.byteOffset === 0 &&
      datos.byteLength === datos.buffer.byteLength
        ? datos
        : new Uint8Array(datos);
    const ext = path.extname(__filename); // .ts con ts-node, .js compilado
    const worker = new Worker(path.join(__dirname, `preview-worker${ext}`), {
      workerData: { datos: transferible, extension },
      transferList: [transferible.buffer as ArrayBuffer],
      resourceLimits: WORKER_RESOURCE_LIMITS,
      ...(ext === ".ts" && {
        execArgv: ["-r", "ts-node/register/transpile-only"],
      }),
    });

    let terminado = false;
    const cerrar = (accion: () => void) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      void worker.terminate();
      accion();
    };
    const timer = setTimeout(
      () => cerrar(() => reject(new Error("Timeout generando el preview"))),
      timeoutMs,
    );

    worker.once(
      "message",
      (msg: { ok: boolean; stl?: Uint8Array; error?: string }) =>
        cerrar(() =>
          msg.ok && msg.stl
            ? resolve(msg.stl)
            : reject(new Error(msg.error ?? "No se pudo generar el preview")),
        ),
    );
    worker.once("error", (error) => cerrar(() => reject(error)));
    worker.once("exit", (code) =>
      cerrar(() => reject(new Error(`El worker terminó con código ${code}`))),
    );
  });
}
