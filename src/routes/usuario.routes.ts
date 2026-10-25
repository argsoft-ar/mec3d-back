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
import { getMiBilletera } from "../controllers/billetera.controller";
import { billeteraQuerySchema } from "../schemas/pago.schema";
import {
  updateProfileSchema,
  setMaterialesSchema,
  getFabricantesSchema,
  changeRolSchema,
  setTecnologiasSchema,
  checkUsernameSchema,
} from "../schemas/usuario.schema";
import { uuidParamSchema } from "../schemas/common.schema";

const router = Router();

router.get("/perfil", authenticateToken, getMyProfile);

// Billetera del usuario autenticado: movimientos propios (retenido / pendiente de payout / pagado)
router.get(
  "/mi-billetera",
  authenticateToken,
  validateSchema(billeteraQuerySchema),
  getMiBilletera,
);
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
// Perfiles de fabricantes (descripción, experiencia, zona): solo usuarios autenticados.
// Ningún flujo del front los consume sin sesión; evita scraping anónimo.
router.get(
  "/fabricantes",
  authenticateToken,
  validateSchema(getFabricantesSchema),
  getFabricantesCercanos,
);
router.get(
  "/fabricantes/:id",
  authenticateToken,
  validateSchema(uuidParamSchema),
  getFabricanteById,
);
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
