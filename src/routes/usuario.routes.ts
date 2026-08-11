import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
<<<<<<< HEAD
=======
import { validateSchema } from "../middlewares/validate.middleware";
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563
import {
  getMyProfile,
  updateMyProfile,
  setMisMateriales,
<<<<<<< HEAD
} from "../controllers/usuario.controller";
=======
  getFabricantesCercanos,
  getFabricanteById,
} from "../controllers/usuario.controller";
import {
  updateProfileSchema,
  setMaterialesSchema,
  getFabricantesSchema,
} from "../schemas/usuario.schema";
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563

const router = Router();

router.get("/perfil", authenticateToken, getMyProfile);
<<<<<<< HEAD
router.put("/perfil", authenticateToken, updateMyProfile);
router.put("/materiales", authenticateToken, setMisMateriales);
=======
router.put(
  "/perfil",
  authenticateToken,
  validateSchema(updateProfileSchema),
  updateMyProfile,
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
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563

export default router;
