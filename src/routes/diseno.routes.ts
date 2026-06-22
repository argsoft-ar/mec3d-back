import { Router } from "express";
import {
  getAllProducts,
  createProduct,
  updateProduct,
  partialUpdateProduct,
  deleteProduct,
  getMyProducts,
} from "../controllers/diseno.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  createProductSchema,
  updateProductSchema,
  partialUpdateProductSchema,
} from "../schemas/diseno.schema";

const router = Router();

// Obtener mis productos (protegido por auth)
router.get("/mis-disenos", authenticateToken, getMyProducts);

// Obtener todos los productos (público)
router.get("/", getAllProducts);

// Crear un producto (protegido por auth + Zod)
router.post(
  "/",
  authenticateToken,
  validateSchema(createProductSchema),
  createProduct,
);

// Actualizar un producto completo (protegido por auth + Zod)
router.put(
  "/:id",
  authenticateToken,
  validateSchema(updateProductSchema),
  updateProduct,
);

// Actualización parcial de un producto (protegido por auth + Zod)
router.patch(
  "/:id",
  authenticateToken,
  validateSchema(partialUpdateProductSchema),
  partialUpdateProduct,
);

// Eliminar un producto (protegido por auth)
router.delete("/:id", authenticateToken, deleteProduct);

export default router;
