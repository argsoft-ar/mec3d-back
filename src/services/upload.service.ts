import cloudinary from "../config/cloudinary.config";
import { AppError } from "../errors/app-error";

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
};
