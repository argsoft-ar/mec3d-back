import { Router, Request, Response } from 'express';
import { healthCheck } from '../controllers/health.controller';
import authRoutes from './auth.routes';

const router = Router();

// Endpoint de prueba centralizado
router.get('/health', healthCheck);

// Rutas de autenticación
router.use('/auth', authRoutes);

export default router;
