import { Router } from "express";
import {
  getProvincias,
  getDepartamentos,
  getLocalidades,
} from "../controllers/georef.controller";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  provinciaIdParamSchema,
  localidadesQuerySchema,
} from "../schemas/georef.schema";

const router = Router();

// Endpoints públicos: se usan en el formulario de registro (sin auth)
router.get("/provincias", getProvincias);

router.get(
  "/provincias/:provinciaId/departamentos",
  validateSchema(provinciaIdParamSchema),
  getDepartamentos,
);

router.get(
  "/localidades",
  validateSchema(localidadesQuerySchema),
  getLocalidades,
);

export default router;
