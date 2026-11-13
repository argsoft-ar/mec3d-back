import { Router } from "express";
import {
  registerUser,
  loginUser,
  checkUsernameDisponible,
  getMe,
  logoutUser,
  createSocketToken,
} from "../controllers/auth.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
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
  emptyRequestSchema,
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

// Sesión actual (cookie mec3d_session): 401 si falta o es inválida
router.get("/me", authenticateToken, validateSchema(emptyRequestSchema), getMe);

// Cierra la sesión borrando la cookie; funciona aunque no haya sesión
router.post("/logout", validateSchema(emptyRequestSchema), logoutUser);

// Token efímero (aud "socket", ~60 s) para el handshake de socket.io
router.post(
  "/socket-token",
  authenticateToken,
  validateSchema(emptyRequestSchema),
  createSocketToken,
);

export default router;
