import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  getMyProfile,
  updateMyProfile,
  setMisMateriales,
  getFabricantesCercanos,
  getFabricanteById,
} from "../controllers/usuario.controller";
import {
  updateProfileSchema,
  setMaterialesSchema,
  getFabricantesSchema,
} from "../schemas/usuario.schema";

const router = Router();

router.get("/perfil", authenticateToken, getMyProfile);
router.put("/perfil", authenticateToken, validateSchema(updateProfileSchema), updateMyProfile);
router.put("/materiales", authenticateToken, validateSchema(setMaterialesSchema), setMisMateriales);
router.get("/fabricantes", validateSchema(getFabricantesSchema), getFabricantesCercanos);
router.get("/fabricantes/:id", getFabricanteById);

export default router;
