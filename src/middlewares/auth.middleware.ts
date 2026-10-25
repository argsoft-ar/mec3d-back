import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import { userRepository } from "../repositories/user.repository";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers["authorization"];

  // El header usualmente tiene el formato: "Bearer <token>"
  const token = authHeader?.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Acceso denegado. Token no proporcionado." });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Token inválido o expirado." });
    return;
  }

  // Inyectar los datos del usuario en la request para su uso en los controladores
  req.user = payload;
  next();
};

// Debe ir después de authenticateToken. El rol se relee de la DB: un JWT emitido antes de un
// cambio de rol no concede ni conserva privilegios de admin.
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const usuario = req.user
      ? await userRepository.findById(req.user.id)
      : null;
    if (usuario?.rol_principal !== "admin") {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
