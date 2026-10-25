import { randomUUID } from "node:crypto";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import cloudinary from "../config/cloudinary.config";
import r2Client from "../config/r2.config";
import { envConfig } from "../config/env.config";
import { AppError } from "../errors/app-error";
import type { UploadTipo } from "../interfaces/upload.interface";
import { uploadRepository } from "../repositories/upload.repository";

// Content-Type por extensión de archivo de modelo 3D o plano técnico
const MODEL_CONTENT_TYPES: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".step": "application/step",
  ".stp": "application/step",
  ".pdf": "application/pdf",
  ".dwg": "image/vnd.dwg",
  ".dxf": "image/vnd.dxf",
};

// Sanitiza el nombre de archivo evitando path traversal y caracteres inválidos
const sanitizeFilename = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
  return `${base}${ext}`;
};

async function registrarSubida(
  key: string,
  usuarioId: string,
  tipo: UploadTipo,
): Promise<void> {
  try {
    await uploadRepository.registrar({ key, usuarioId, tipo });
  } catch (error) {
    // Sin registro el archivo no podría asociarse a un diseño: se informa el fallo.
    console.error(
      `❌ No se pudo registrar la subida ${key}:`,
      error instanceof Error ? error.message : error,
    );
    throw new AppError(
      "No se pudo registrar la subida, intente nuevamente",
      500,
    );
  }
}

export const uploadService = {
  // Cada subida queda registrada con su dueño: un diseño solo puede referenciar uploads propios.
  async uploadImage(
    buffer: Buffer,
    filename: string,
    usuarioId: string,
  ): Promise<string> {
    const subida = await new Promise<{ url: string; publicId: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "mec3d/portadas",
            format: "webp",
            transformation: [{ width: 800, height: 600, crop: "limit" }],
          },
          (error, result) => {
            if (error) {
              console.error("❌ Error de Cloudinary:", error);
              reject(new AppError("Error al subir la imagen a la nube", 500));
              return;
            }

            if (!result?.secure_url || !result.public_id) {
              reject(new AppError("No se obtuvo URL de la imagen", 500));
              return;
            }

            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );

        uploadStream.end(buffer);
      },
    );

    await registrarSubida(subida.publicId, usuarioId, "imagen");
    return subida.url;
  },

  async uploadModel(
    buffer: Buffer,
    filename: string,
    usuarioId: string,
  ): Promise<string> {
    const ext = path.extname(filename).toLowerCase();
    const safeName = sanitizeFilename(filename);
    const key = `mec3d/modelos/${randomUUID()}-${safeName}`;
    const contentType = MODEL_CONTENT_TYPES[ext] || "application/octet-stream";

    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: envConfig.r2.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      console.error("❌ Error de Cloudflare R2:", error);
      throw new AppError("Error al subir el archivo 3D a la nube", 500);
    }

    await registrarSubida(key, usuarioId, "modelo");

    let base = envConfig.r2.publicUrl || "";
    while (base.endsWith("/")) {
      base = base.slice(0, -1);
    }
    return `${base}/${key}`;
  },
};
