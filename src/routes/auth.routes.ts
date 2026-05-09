import { Router } from 'express';
import { registerUser, loginUser } from '../controllers/auth.controller';
import { validateSchema } from '../middlewares/validate.middleware';
import { registerSchema, loginSchema } from '../schemas/auth.schema';

const router = Router();

// Endpoint de registro
router.post('/registro', validateSchema(registerSchema), registerUser);

// Endpoint de login
router.post('/login', validateSchema(loginSchema), loginUser);

export default router;
