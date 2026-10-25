import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import r2Client from "../config/r2.config";
import { envConfig } from "../config/env.config";
import { disenoRepository } from "../repositories/diseno.repository";
import { PREVIEW_KEY_PREFIX, PREVIEW_KEY_REGEX } from "./archivo.service";
import { extractR2Key } from "../utils/upload-key.util";
import {
  CATEGORIA_PLANOS_TECNICOS,
  extensionDeArchivoUrl,
} from "../utils/plano.util";
import { esExtensionPreview } from "../utils/mesh-preview.util";
import { generarStlEnWorker } from "../utils/preview-worker.util";

// Tope de descarga del original (archivos previos al límite actual pueden pesar hasta 30 MB).
export const PREVIEW_MAX_INPUT_BYTES = 35 * 1024 * 1024;
const R2_TIMEOUT_MS = 30_000;
// Generaciones en cola; al superarlo se descarta (el backfill las recupera).
const MAX_PENDIENTES = 20;
// Tope por diseñador dentro de MAX_PENDIENTES, para que un usuario no llene la cola.
export const MAX_PENDIENTES_POR_USUARIO = 3;

let cola: Promise<void> = Promise.resolve();
let pendientes = 0;
// Diseño -> archivo vigente (el último pedido): una tarea cuyo archivo ya no es el vigente se saltea.
const enProceso = new Map<string, string>();
// Tareas en cola o en curso por "diseño|archivo": un mismo trabajo no se encola dos veces.
const encoladas = new Set<string>();
const pendientesPorUsuario = new Map<string, number>();

function nombreError(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

async function descargarOriginal(key: string): Promise<Uint8Array> {
  const res = await r2Client.send(
    new GetObjectCommand({ Bucket: envConfig.r2.bucketName, Key: key }),
    { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) },
  );
  if ((res.ContentLength ?? 0) > PREVIEW_MAX_INPUT_BYTES) {
    throw new Error("El archivo supera el tamaño máximo para el preview");
  }
  const body = res.Body as Readable | undefined;
  if (!body) throw new Error("Respuesta de R2 sin cuerpo");

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > PREVIEW_MAX_INPUT_BYTES) {
      body.destroy();
      throw new Error("El archivo supera el tamaño máximo para el preview");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

async function borrarObjeto(key: string): Promise<void> {
  try {
    await r2Client.send(
      new DeleteObjectCommand({ Bucket: envConfig.r2.bucketName, Key: key }),
      { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) },
    );
  } catch (error) {
    console.error(
      `❌ No se pudo borrar un preview huérfano: ${nombreError(error)}`,
    );
  }
}

export const previewService = {
  // Genera, sube y registra el preview degradado. Best-effort: ante cualquier fallo loguea
  // solo el id del diseño y deja preview_url como estaba. Devuelve true si quedó guardado.
  // Con `reemplazarDe` (clave del preview actual) lo sustituye y borra el viejo solo tras guardar el nuevo.
  async generar(
    disenoId: string,
    archivoUrl: string,
    opts: { reemplazarDe?: string | null } = {},
  ): Promise<boolean> {
    const reemplazarDe = opts.reemplazarDe ?? undefined;
    let previewKey: string | null = null;
    try {
      const originalKey = extractR2Key(archivoUrl);
      const ext = extensionDeArchivoUrl(archivoUrl);
      if (!originalKey || !esExtensionPreview(ext)) return false;

      const original = await descargarOriginal(originalKey);
      const stl = await generarStlEnWorker(original, ext); // transfiere `original`: no se reutiliza

      previewKey = `${PREVIEW_KEY_PREFIX}${randomUUID()}.stl`;
      await r2Client.send(
        new PutObjectCommand({
          Bucket: envConfig.r2.bucketName,
          Key: previewKey,
          Body: stl,
          ContentType: "model/stl",
        }),
        { abortSignal: AbortSignal.timeout(R2_TIMEOUT_MS) },
      );

      const guardado = await disenoRepository.setPreviewUrl(
        disenoId,
        archivoUrl,
        previewKey,
        reemplazarDe,
      );
      if (!guardado) {
        await borrarObjeto(previewKey);
        return false;
      }
      if (reemplazarDe) await previewService.descartar(reemplazarDe);
      return true;
    } catch (error) {
      console.error(
        `❌ No se pudo generar el preview del diseño ${disenoId}: ${nombreError(error)}`,
      );
      if (previewKey) await borrarObjeto(previewKey);
      return false;
    }
  },

  // Encola la generación sin bloquear al caller (de a una por vez, con topes global y por usuario).
  // La promesa devuelta nunca rechaza; los callers de create/update no la esperan.
  // Un mismo diseño+archivo en cola/en curso no se reencola (aunque haya alternado con otro
  // archivo en el medio); al ejecutarse, una tarea cuyo archivo ya no es el vigente se saltea.
  programar(
    disenoId: string,
    archivoUrl: string,
    userId?: string,
  ): Promise<void> {
    const clave = `${disenoId}|${archivoUrl}`;
    if (encoladas.has(clave)) {
      enProceso.set(disenoId, archivoUrl);
      return Promise.resolve();
    }
    const delUsuario = userId ? (pendientesPorUsuario.get(userId) ?? 0) : 0;
    if (
      pendientes >= MAX_PENDIENTES ||
      delUsuario >= MAX_PENDIENTES_POR_USUARIO
    ) {
      console.warn(
        `⚠️ Cola de previews llena: se omite el diseño ${disenoId} (queda para el backfill)`,
      );
      enProceso.delete(disenoId); // lo ya encolado para este diseño quedó obsoleto
      return Promise.resolve();
    }
    pendientes++;
    encoladas.add(clave);
    enProceso.set(disenoId, archivoUrl);
    if (userId) pendientesPorUsuario.set(userId, delUsuario + 1);
    const tarea = cola.then(() =>
      enProceso.get(disenoId) === archivoUrl
        ? previewService.generar(disenoId, archivoUrl)
        : false,
    );
    cola = tarea
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        pendientes--;
        encoladas.delete(clave);
        if (enProceso.get(disenoId) === archivoUrl) enProceso.delete(disenoId);
        if (userId) {
          const resto = (pendientesPorUsuario.get(userId) ?? 1) - 1;
          if (resto > 0) pendientesPorUsuario.set(userId, resto);
          else pendientesPorUsuario.delete(userId);
        }
      });
    return cola;
  },

  // Borra el preview de un archivo reemplazado o dado de baja (best-effort, solo claves de preview válidas).
  async descartar(previewKey: string | null | undefined): Promise<void> {
    if (!previewKey || !PREVIEW_KEY_REGEX.test(previewKey)) return;
    await borrarObjeto(previewKey);
  },

  // Backfill idempotente: procesa los diseños activos sin preview (no planos técnicos).
  // Con `regenerar` procesa también los que ya tienen preview y reemplaza el existente.
  async backfill(
    opts: {
      lote?: number;
      regenerar?: boolean;
      log?: (msg: string) => void;
    } = {},
  ): Promise<{ procesados: number; generados: number; omitidos: number }> {
    const lote = opts.lote ?? 50;
    const log = opts.log ?? (() => undefined);
    let cursor = "00000000-0000-0000-0000-000000000000";
    const resultado = { procesados: 0, generados: 0, omitidos: 0 };

    for (;;) {
      const filas: {
        id: string;
        archivo_url: string;
        preview_url?: string | null;
      }[] = opts.regenerar
        ? await disenoRepository.listarParaRegenerar(
            cursor,
            lote,
            CATEGORIA_PLANOS_TECNICOS,
          )
        : await disenoRepository.listarSinPreview(
            cursor,
            lote,
            CATEGORIA_PLANOS_TECNICOS,
          );
      if (filas.length === 0) break;
      for (const fila of filas) {
        resultado.procesados++;
        const ok = await previewService.generar(
          fila.id,
          fila.archivo_url,
          opts.regenerar ? { reemplazarDe: fila.preview_url } : {},
        );
        if (ok) resultado.generados++;
        else resultado.omitidos++;
        log(`Diseño ${fila.id}: ${ok ? "preview generado" : "omitido"}`);
      }
      cursor = filas[filas.length - 1].id;
    }
    return resultado;
  },
};
