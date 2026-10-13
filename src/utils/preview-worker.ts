import { parentPort, workerData } from "node:worker_threads";
import { generarPreviewStl } from "./mesh-preview.util";
import type { ExtensionPreview } from "./mesh-preview.util";

// Entrada del worker: convierte el original en el STL degradado fuera del hilo principal.
const { datos, extension } = workerData as {
  datos: Uint8Array;
  extension: ExtensionPreview;
};

try {
  const stl = generarPreviewStl(datos, extension);
  // El STL se arma en un buffer propio: se transfiere en vez de clonarse.
  parentPort?.postMessage({ ok: true, stl }, [stl.buffer as ArrayBuffer]);
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : "Error desconocido",
  });
}
