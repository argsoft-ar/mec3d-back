import { Router } from "express";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  partialUpdateProduct,
  deleteProduct,
  getMyProducts,
  getArchivoPreview,
  getPreviewPublico,
} from "../controllers/diseno.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  previewPublicoLimiter,
  productoEscrituraLimiter,
} from "../middlewares/rate-limit.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  createProductSchema,
  updateProductSchema,
  partialUpdateProductSchema,
  uuidParamSchema,
  listProductsSchema,
} from "../schemas";

const router = Router();

// Obtener mis productos (protegido por auth)
router.get("/mis-disenos", authenticateToken, getMyProducts);

// URL firmada (vida corta) del archivo para el preview 3D: dueño, comprador pagado o
// fabricante con orden activa pagada. Nunca se expone archivoUrl en lecturas públicas.
router.get(
  "/:id/archivo-preview",
  authenticateToken,
  validateSchema(uuidParamSchema),
  getArchivoPreview,
);

// Preview 3D degradado, público (sin login): solo sirve la versión simplificada, nunca el original.
router.get(
  "/:id/preview-publico",
  previewPublicoLimiter,
  validateSchema(uuidParamSchema),
  getPreviewPublico,
);

// Obtener todos los productos (público) - con paginación y orden por cercanía opcional
router.get("/", validateSchema(listProductsSchema), getAllProducts);

// Obtener un producto por id (público). Va después de /mis-disenos, /:id/archivo-preview y /:id/preview-publico.
router.get("/:id", validateSchema(uuidParamSchema), getProductById);

// Crear un producto (protegido por auth + Zod)
router.post(
  "/",
  authenticateToken,
  productoEscrituraLimiter,
  validateSchema(createProductSchema),
  createProduct,
);

// Actualizar un producto completo (protegido por auth + Zod + UUID)
router.put(
  "/:id",
  authenticateToken,
  productoEscrituraLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(updateProductSchema),
  updateProduct,
);

// Actualización parcial de un producto (protegido por auth + Zod + UUID)
router.patch(
  "/:id",
  authenticateToken,
  productoEscrituraLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(partialUpdateProductSchema),
  partialUpdateProduct,
);

// Eliminar un producto (protegido por auth + UUID)
router.delete(
  "/:id",
  authenticateToken,
  validateSchema(uuidParamSchema),
  deleteProduct,
);

export default router;
