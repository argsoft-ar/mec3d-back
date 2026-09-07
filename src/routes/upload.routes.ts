import { Router } from "express";
import { uploadImage, uploadModel } from "../controllers/upload.controller";
import {
  uploadImageMiddleware,
  uploadModelMiddleware,
} from "../middlewares/upload.middleware";
import { authenticateToken } from "../middlewares/auth.middleware";
import { uploadLimiter } from "../middlewares/rate-limit.middleware";

const router = Router();

// Subir una imagen (protegido por auth y rate limiting).
// Multer interceptará el campo 'imagen' del form-data.
router.post(
  "/imagen",
  uploadLimiter,
  authenticateToken,
  uploadImageMiddleware.single("imagen"),
  uploadImage,
);

// Subir un archivo de diseño 3D (protegido por auth y rate limiting).
// Multer interceptará el campo 'archivo' del form-data.
router.post(
  "/modelo",
  uploadLimiter,
  authenticateToken,
  uploadModelMiddleware.single("archivo"),
  uploadModel,
);

export default router;
