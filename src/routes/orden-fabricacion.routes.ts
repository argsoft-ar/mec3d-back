import { Router } from "express";
import {
  crearOrdenesFabricacion,
  getFabricantesSugeridos,
  proponerPrecio,
  cerrarTrato,
} from "../controllers/orden-fabricacion.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import {
  crearOrdenesFabricacionSchema,
  fabricantesSugeridosSchema,
  proponerPrecioBodySchema,
  cerrarTratoBodySchema,
} from "../schemas/orden-fabricacion.schema";
import { cerrarTratoLimiter } from "../middlewares/rate-limit.middleware";

const router = Router();

// Candidatos a fabricante: filtrados por zona, tecnología compatible y puntuación
router.get(
  "/fabricantes-sugeridos",
  authenticateToken,
  validateSchema(fabricantesSugeridosSchema),
  getFabricantesSugeridos,
);

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

export default router;
