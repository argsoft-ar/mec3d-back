import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  getMyProfile,
  updateMyProfile,
  setMisMateriales,
} from "../controllers/usuario.controller";

const router = Router();

router.get("/perfil", authenticateToken, getMyProfile);
router.put("/perfil", authenticateToken, updateMyProfile);
router.put("/materiales", authenticateToken, setMisMateriales);

export default router;
