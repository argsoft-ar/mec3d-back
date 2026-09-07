import { Request, Response, NextFunction } from "express";
import { uploadService } from "../services/upload.service";
import { ValidationError } from "../errors/app-error";
import {
  validateImageSignature,
  validateModelSignature,
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

    // Validar extensión/firma del archivo (segunda capa de seguridad)
    if (!validateModelSignature(req.file.buffer, req.file.originalname)) {
      throw new ValidationError("El archivo no es un modelo 3D válido");
    }

    const url = await uploadService.uploadModel(
      req.file.buffer,
      req.file.originalname,
    );

    res.status(200).json({
      message: "Archivo 3D subido exitosamente",
      url,
    });
  } catch (error) {
    next(error);
  }
};
