import { Request, Response, NextFunction } from "express";
import { uploadService } from "../services/upload.service";
import { ValidationError } from "../errors/app-error";
import {
  isPlanoFile,
  MAX_PLANO_SIZE_BYTES,
  validateImageSignature,
  validateModelSignature,
  validatePlanoSignature,
} from "../middlewares/upload.middleware";

export const uploadImage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      throw new ValidationError("No se ha enviado ninguna imagen");
    }

    // Validar magic number del archivo (segunda capa de seguridad)
    if (!validateImageSignature(req.file.buffer)) {
      throw new ValidationError("El archivo no es una imagen válida");
    }

    const url = await uploadService.uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.user!.id,
    );

    res.status(200).json({
      message: "Imagen subida exitosamente",
      url,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadModel = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      throw new ValidationError("No se ha enviado ningún archivo");
    }

    const { buffer, originalname, size } = req.file;
    const esPlano = isPlanoFile(originalname);

    // Validar extensión/firma del archivo (segunda capa de seguridad)
    if (esPlano) {
      if (size > MAX_PLANO_SIZE_BYTES) {
        throw new ValidationError(
          "El plano excede el tamaño máximo permitido (5 MB)",
        );
      }
      if (!validatePlanoSignature(buffer, originalname)) {
        throw new ValidationError(
          "El archivo no es un plano válido (PDF, DWG o DXF)",
        );
      }
    } else if (!validateModelSignature(buffer, originalname)) {
      throw new ValidationError("El archivo no es un modelo 3D válido");
    }

    const url = await uploadService.uploadModel(
      buffer,
      originalname,
      req.user!.id,
    );

    res.status(200).json({
      message: esPlano
        ? "Plano subido exitosamente"
        : "Archivo 3D subido exitosamente",
      url,
    });
  } catch (error) {
    next(error);
  }
};
