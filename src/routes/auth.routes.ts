import { Router } from "express";
import {
  registerUser,
  loginUser,
  checkUsernameDisponible,
} from "../controllers/auth.controller";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  authLimiter,
  registroLimiter,
  usernameCheckLimiter,
} from "../middlewares/rate-limit.middleware";
import {
  registerSchema,
  loginSchema,
  checkUsernameDisponibleSchema,
} from "../schemas/auth.schema";

const router = Router();

// Disponibilidad de username (público, para el formulario de registro)
router.get(
  "/username-disponible",
  usernameCheckLimiter,
  validateSchema(checkUsernameDisponibleSchema),
  checkUsernameDisponible,
);

// Endpoint de registro con rate limiting
router.post(
  "/registro",
  registroLimiter,
  validateSchema(registerSchema),
  registerUser,
);

// Endpoint de login con rate limiting
router.post("/login", authLimiter, validateSchema(loginSchema), loginUser);

export default router;
