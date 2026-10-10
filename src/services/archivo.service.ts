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

export const archivoService = {
  // Archivos de R2: presigned GET de 5 min. Otros: solo si el host está en la allowlist
  // (archivos legacy); si no, se niega en vez de redirigir a un destino arbitrario.
  async firmarUrl(archivoUrl: string): Promise<ArchivoFirmado> {
    const key = extractR2Key(archivoUrl);
    if (key) {
      if (!envConfig.r2.bucketName) {
        console.error(
          "❌ R2_BUCKET_NAME no configurado: no se puede firmar la URL",
        );
        throw new AppError("El archivo no está disponible", 503);
      }
      try {
        const url = await getSignedUrl(
          r2Client,
          new GetObjectCommand({ Bucket: envConfig.r2.bucketName, Key: key }),
          { expiresIn: ARCHIVO_URL_TTL_SECONDS },
        );
        return { url, expiresIn: ARCHIVO_URL_TTL_SECONDS };
      } catch (error) {
        console.error(
          "❌ No se pudo firmar la URL del archivo:",
          error instanceof Error ? error.message : error,
        );
        throw new AppError("El archivo no está disponible", 503);
      }
    }

    if (isTrustedAssetHost(archivoUrl)) {
      return { url: archivoUrl, expiresIn: null };
    }
    console.error(
      "❌ archivo_url con host no permitido, se rechaza la entrega",
    );
    throw new AppError("El archivo no está disponible", 502);
  },
};
