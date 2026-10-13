import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import r2Client from "../config/r2.config";
import { envConfig } from "../config/env.config";
import { AppError } from "../errors/app-error";
import { isTrustedAssetHost } from "../schemas/diseno.schema";
import { extractR2Key } from "../utils/upload-key.util";

export { extractR2Key };

// Vida de las URLs firmadas del archivo de pago.
export const ARCHIVO_URL_TTL_SECONDS = 300;

export interface ArchivoFirmado {
  url: string;
  // Segundos de vigencia; null cuando el archivo es externo y la URL no expira.
  expiresIn: number | null;
}

// Los previews degradados viven en R2 bajo este prefijo, separado de los originales.
export const PREVIEW_KEY_PREFIX = "previews/";
export const PREVIEW_KEY_REGEX =
  /^previews\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.stl$/;

export interface PreviewFirmado {
  url: string;
  expiresIn: number;
  format: "stl";
}

async function firmarKeyR2(
  key: string,
  opts: { adjunto?: boolean; contentType?: string } = {},
): Promise<ArchivoFirmado> {
  if (!envConfig.r2.bucketName) {
    console.error(
      "❌ R2_BUCKET_NAME no configurado: no se puede firmar la URL",
    );
    throw new AppError("El archivo no está disponible", 503);
  }
  try {
    const url = await getSignedUrl(
      r2Client,
      new GetObjectCommand({
        Bucket: envConfig.r2.bucketName,
        Key: key,
        ...(opts.adjunto && { ResponseContentDisposition: "attachment" }),
        ...(opts.contentType && { ResponseContentType: opts.contentType }),
      }),
      { expiresIn: ARCHIVO_URL_TTL_SECONDS },
    );
    return { url, expiresIn: ARCHIVO_URL_TTL_SECONDS };
  } catch (error) {
    // Solo el nombre del error: el mensaje del SDK puede incluir la key del objeto.
    console.error(
      "❌ No se pudo firmar la URL del archivo:",
      error instanceof Error ? error.name : "Error",
    );
    throw new AppError("El archivo no está disponible", 503);
  }
}

export const archivoService = {
  // Archivos de R2: presigned GET de 5 min. Otros: solo si el host está en la allowlist
  // (archivos legacy); si no, se niega en vez de redirigir a un destino arbitrario.
  // `adjunto` fuerza Content-Disposition: attachment (descarga del comprador) para que
  // el navegador nunca renderice el archivo inline.
  async firmarUrl(
    archivoUrl: string,
    opts: { adjunto?: boolean } = {},
  ): Promise<ArchivoFirmado> {
    const key = extractR2Key(archivoUrl);
    if (key) return firmarKeyR2(key, opts);

    if (isTrustedAssetHost(archivoUrl)) {
      return { url: archivoUrl, expiresIn: null };
    }
    console.error(
      "❌ archivo_url con host no permitido, se rechaza la entrega",
    );
    throw new AppError("El archivo no está disponible", 502);
  },

  // Firma únicamente claves de preview (previews/<uuid>.stl): jamás un original ni un host externo.
  async firmarPreview(previewKey: string): Promise<PreviewFirmado> {
    if (!PREVIEW_KEY_REGEX.test(previewKey)) {
      console.error(
        "❌ preview_url con formato inválido, se rechaza la entrega",
      );
      throw new AppError("La vista previa no está disponible", 502);
    }
    const { url, expiresIn } = await firmarKeyR2(previewKey, {
      contentType: "model/stl",
    });
    return {
      url,
      expiresIn: expiresIn ?? ARCHIVO_URL_TTL_SECONDS,
      format: "stl",
    };
  },
};
