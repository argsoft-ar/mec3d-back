import { Router } from 'express';
import { 
  getAllProducts, 
  createProduct,
  updateProduct,
  partialUpdateProduct,
  deleteProduct
} from '../controllers/diseno.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Obtener todos los productos (público)
router.get('/', getAllProducts);

// Crear un producto (protegido por auth)
router.post('/', authenticateToken, createProduct);

// Actualizar un producto completo (protegido por auth)
router.put('/:id', authenticateToken, updateProduct);

// Actualización parcial de un producto (protegido por auth)
router.patch('/:id', authenticateToken, partialUpdateProduct);

// Eliminar un producto (protegido por auth)
router.delete('/:id', authenticateToken, deleteProduct);

export default router;
