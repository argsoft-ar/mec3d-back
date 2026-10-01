import { Router } from "express";
import {
  crearCompra,
  getMisCompras,
  descargarArchivo,
  confirmarEntrega,
} from "../controllers/compra.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import {
  crearCompraSchema,
  confirmarEntregaBodySchema,
} from "../schemas/compra.schema";
import { confirmarEntregaLimiter } from "../middlewares/rate-limit.middleware";

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

// Confirmación de entrega vía token de escrow
router.post(
  "/:id/confirmar-entrega",
  authenticateToken,
  confirmarEntregaLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(confirmarEntregaBodySchema),
  confirmarEntrega,
);

export default router;
