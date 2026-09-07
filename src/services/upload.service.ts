import { randomUUID } from "node:crypto";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import cloudinary from "../config/cloudinary.config";
import r2Client from "../config/r2.config";
import { envConfig } from "../config/env.config";
import { AppError } from "../errors/app-error";

// Content-Type por extensión de archivo de modelo 3D
const MODEL_CONTENT_TYPES: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".step": "application/step",
  ".stp": "application/step",
};

// Sanitiza el nombre de archivo evitando path traversal y caracteres inválidos
const sanitizeFilename = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${base}${ext}`;
};

export const uploadService = {
  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
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

          if (!result?.secure_url) {
            reject(new AppError("No se obtuvo URL de la imagen", 500));
            return;
          }

          resolve(result.secure_url);
        },
      );

      uploadStream.end(buffer);
    });
  },

  async uploadModel(buffer: Buffer, filename: string): Promise<string> {
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

    let base = envConfig.r2.publicUrl || "";
    while (base.endsWith("/")) {
      base = base.slice(0, -1);
    }
    return `${base}/${key}`;
  },
};
