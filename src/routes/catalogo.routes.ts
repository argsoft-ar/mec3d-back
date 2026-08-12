import { Router } from "express";
import {
  getMateriales,
  getTecnologias,
} from "../controllers/catalogo.controller";

const router = Router();

router.get("/materiales", getMateriales);
router.get("/tecnologias", getTecnologias);

export default router;
