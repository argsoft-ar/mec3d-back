import jwt from "jsonwebtoken";
import { envConfig } from "../config/env.config";
import { TokenPayload } from "../interfaces/auth.interface";

// Validar al importar - la app NO debe arrancar sin secret
const JWT_SECRET = envConfig.jwt.secret;
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET no está configurado. La aplicación no puede iniciar de forma segura.",
  );
}

const JWT_EXPIRES_IN = envConfig.jwt.expiresIn || "1d";

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
};
