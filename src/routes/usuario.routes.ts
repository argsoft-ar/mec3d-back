import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  getMyProfile,
  updateMyProfile,
  setMisMateriales,
  getFabricantesCercanos,
  getFabricanteById,
  changeMyRol,
  deleteFabricanteStatus,
  setMisTecnologias,
  checkUsername,
} from "../controllers/usuario.controller";
import {
  updateProfileSchema,
  setMaterialesSchema,
  getFabricantesSchema,
  changeRolSchema,
  setTecnologiasSchema,
  checkUsernameSchema,
} from "../schemas/usuario.schema";

const router = Router();

router.get("/perfil", authenticateToken, getMyProfile);
router.put(
  "/perfil",
  authenticateToken,
  validateSchema(updateProfileSchema),
  updateMyProfile,
);
router.get(
  "/username-disponible",
  authenticateToken,
  validateSchema(checkUsernameSchema),
  checkUsername,
);
router.put(
  "/materiales",
  authenticateToken,
  validateSchema(setMaterialesSchema),
  setMisMateriales,
);
router.get(
  "/fabricantes",
  validateSchema(getFabricantesSchema),
  getFabricantesCercanos,
);
router.get("/fabricantes/:id", getFabricanteById);
router.patch(
  "/rol",
  authenticateToken,
  validateSchema(changeRolSchema),
  changeMyRol,
);
router.delete("/fabricante", authenticateToken, deleteFabricanteStatus);
router.put(
  "/tecnologias",
  authenticateToken,
  validateSchema(setTecnologiasSchema),
  setMisTecnologias,
);

export default router;
