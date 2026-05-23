import { Router } from 'express';
import { uploadImage } from '../controllers/upload.controller';
import { uploadImageMiddleware } from '../middlewares/upload.middleware';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Subir una imagen (protegido por auth).
// Multer interceptará el campo 'imagen' del form-data.
router.post('/imagen', authenticateToken, uploadImageMiddleware.single('imagen'), uploadImage);

export default router;
