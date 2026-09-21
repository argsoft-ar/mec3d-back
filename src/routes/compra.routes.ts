import { Router } from "express";
import {
  crearCompra,
  getMisCompras,
  descargarArchivo,
} from "../controllers/compra.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import { crearCompraSchema } from "../schemas/compra.schema";

const router = Router();

// Crear una compra (protegido por auth + Zod)
router.post(
  "/",
  authenticateToken,
  validateSchema(crearCompraSchema),
  crearCompra,
);

// Listado de compras del comprador autenticado ("Mis Compras")
router.get("/mis-compras", authenticateToken, getMisCompras);

// Descarga del archivo comprado: IDOR check contra id_comprador en el service,
// no filtra por eliminado_en (una compra pagada no debe perder el acceso al archivo).
router.get(
  "/:id/descargar",
  authenticateToken,
  validateSchema(uuidParamSchema),
  descargarArchivo,
);

export default router;
