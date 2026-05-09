import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt.util';

// Extender la interfaz Request de Express para inyectar el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  
  // El header usualmente tiene el formato: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
    return;
  }

  // Inyectar los datos del usuario en la request para su uso en los controladores
  req.user = payload;
  next();
};
