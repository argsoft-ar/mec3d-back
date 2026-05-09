import jwt from 'jsonwebtoken';
import { envConfig } from '../config/env.config';

// Interface para el payload del token
export interface TokenPayload {
  id: string;
  email: string;
  rol_principal: string;
}

export const generateToken = (payload: TokenPayload): string => {
  const secret = envConfig.jwt.secret || 'default_secret_key'; // Fallback por seguridad
  const expiresIn = envConfig.jwt.expiresIn || '1d';

  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const secret = envConfig.jwt.secret || 'default_secret_key';
    return jwt.verify(token, secret) as TokenPayload;
  } catch (error) {
    return null;
  }
};
