import { Router } from "express";
import {
  getAllProducts,
  createProduct,
  updateProduct,
  partialUpdateProduct,
  deleteProduct,
  getMyProducts,
  getArchivoPreview,
} from "../controllers/diseno.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
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

// Obtener todos los productos (público) - con paginación y orden por cercanía opcional
router.get("/", validateSchema(listProductsSchema), getAllProducts);

// Crear un producto (protegido por auth + Zod)
router.post(
  "/",
  authenticateToken,
  validateSchema(createProductSchema),
  createProduct,
);

// Actualizar un producto completo (protegido por auth + Zod + UUID)
router.put(
  "/:id",
  authenticateToken,
  validateSchema(uuidParamSchema),
  validateSchema(updateProductSchema),
  updateProduct,
);

// Actualización parcial de un producto (protegido por auth + Zod + UUID)
router.patch(
  "/:id",
  authenticateToken,
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
