import { Router } from "express";
import {
  crearOrdenesFabricacion,
  getFabricantesSugeridos,
  proponerPrecio,
  cerrarTrato,
  getCodigoEntrega,
  declararEntregaOrden,
  confirmarEntregaOrden,
  getMisSolicitudesFabricacion,
  descargarDiseno,
  cancelarOrden,
  disputarOrden,
} from "../controllers/orden-fabricacion.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import {
  crearOrdenesFabricacionSchema,
  fabricantesSugeridosSchema,
  proponerPrecioBodySchema,
  cerrarTratoBodySchema,
  confirmarEntregaOrdenBodySchema,
  disputarBodySchema,
} from "../schemas/orden-fabricacion.schema";
import {
  cerrarTratoLimiter,
  codigoEntregaLimiter,
  confirmarEntregaLimiter,
  disputaLimiter,
  pagoLimiter,
  proponerPrecioLimiter,
} from "../middlewares/rate-limit.middleware";

const router = Router();

// Candidatos a fabricante: filtrados por zona, tecnología compatible y puntuación
router.get(
  "/fabricantes-sugeridos",
  authenticateToken,
  validateSchema(fabricantesSugeridosSchema),
  getFabricantesSugeridos,
);

// Listado de solicitudes recibidas por el fabricante autenticado ("Mis solicitudes")
router.get("/mis-solicitudes", authenticateToken, getMisSolicitudesFabricacion);

// Solicitar cotización a uno o más fabricantes para una compra
router.post(
  "/",
  authenticateToken,
  validateSchema(crearOrdenesFabricacionSchema),
  crearOrdenesFabricacion,
);

router.post(
  "/:id/proponer-precio",
  authenticateToken,
  proponerPrecioLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(proponerPrecioBodySchema),
  proponerPrecio,
);

router.post(
  "/:id/cerrar-trato",
  authenticateToken,
  cerrarTratoLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(cerrarTratoBodySchema),
  cerrarTrato,
);

// Código de entrega de 6 dígitos: solo lo puede pedir el comprador dueño, y mientras no se
// haya confirmado la entrega. POST (no GET) porque cada llamada genera un código nuevo e
// invalida el anterior: no es una lectura idempotente ni debe cachearse ni prefetchearse.
router.post(
  "/:id/codigo-entrega",
  authenticateToken,
  codigoEntregaLimiter,
  validateSchema(uuidParamSchema),
  getCodigoEntrega,
);

// El comprador declara la entrega (ya recibió la pieza) y expone el código al
// fabricante in situ; la orden queda "confirmada" hasta que el fabricante la valide.
router.post(
  "/:id/declarar-entrega",
  authenticateToken,
  validateSchema(uuidParamSchema),
  declararEntregaOrden,
);

// El fabricante ingresa el código de entrega que le mostró el comprador in situ.
router.post(
  "/:id/confirmar-entrega",
  authenticateToken,
  confirmarEntregaLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(confirmarEntregaOrdenBodySchema),
  confirmarEntregaOrden,
);

// El comprador congela los fondos de una orden confirmada / con trato cerrado y pago acreditado;
// un admin la resuelve (POST /admin/disputas/:ordenId/resolver).
router.post(
  "/:id/disputar",
  authenticateToken,
  disputaLimiter,
  validateSchema(uuidParamSchema),
  validateSchema(disputarBodySchema),
  disputarOrden,
);

// Cancelación antes de declararse la entrega. Con el pago acreditado solo la puede hacer el
// fabricante (reembolsa al comprador) o un admin; el comprador debe disputar.
router.post(
  "/:id/cancelar",
  authenticateToken,
  pagoLimiter,
  validateSchema(uuidParamSchema),
  cancelarOrden,
);

// Descarga del archivo de diseño habilitada al fabricante mientras el trato esté
// cerrado y no se haya confirmado la entrega.
router.get(
  "/:id/descargar-diseno",
  authenticateToken,
  validateSchema(uuidParamSchema),
  descargarDiseno,
);

export default router;
