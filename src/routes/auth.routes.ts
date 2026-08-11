import { Router } from "express";
import { registerUser, loginUser } from "../controllers/auth.controller";
import { validateSchema } from "../middlewares/validate.middleware";
import { authLimiter } from "../middlewares/rate-limit.middleware";
import { registerSchema, loginSchema } from "../schemas/auth.schema";

const router = Router();

// Endpoint de registro con rate limiting
router.post(
  "/registro",
  authLimiter,
  validateSchema(registerSchema),
  registerUser,
);

// Endpoint de login con rate limiting
router.post("/login", authLimiter, validateSchema(loginSchema), loginUser);

export default router;
