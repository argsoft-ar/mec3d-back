import { Router } from "express";
import {
  crearCompra,
  getMisCompras,
  descargarArchivo,
  pagarCompra,
  getEstadoPago,
} from "../controllers/compra.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { pagoLimiter } from "../middlewares/rate-limit.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import { crearCompraSchema } from "../schemas/compra.schema";

const router = Router();

// Crear una compra: en descarga devuelve además el initPoint de Checkout Pro
router.post(
  "/",
  authenticateToken,
  pagoLimiter,
  validateSchema(crearCompraSchema),
  crearCompra,
);

// Listado de compras del comprador autenticado ("Mis Compras")
router.get("/mis-compras", authenticateToken, getMisCompras);

// Nuevo intento de pago de una compra 'pendiente_pago' (en fabricación, con el trato cerrado)
router.post(
  "/:id/pagar",
  authenticateToken,
  pagoLimiter,
  validateSchema(uuidParamSchema),
  pagarCompra,
);

// Estado de la compra y de su último pago (solo el dueño): el front lo consulta al volver de MP
router.get(
  "/:id/estado-pago",
  authenticateToken,
  validateSchema(uuidParamSchema),
  getEstadoPago,
);

// Descarga del archivo comprado: IDOR check contra id_comprador en el service,
// no filtra por eliminado_en (una compra pagada no debe perder el acceso al archivo).
router.get(
  "/:id/descargar",
  authenticateToken,
  validateSchema(uuidParamSchema),
  descargarArchivo,
);

export default router;
