import { Router } from "express";
import {
  getMateriales,
  getTecnologias,
} from "../controllers/catalogo.controller";
import { validateSchema } from "../middlewares/validate.middleware";
import { listMaterialesSchema } from "../schemas/catalogo.schema";

const router = Router();

router.get("/materiales", validateSchema(listMaterialesSchema), getMateriales);
router.get("/tecnologias", getTecnologias);

export default router;
