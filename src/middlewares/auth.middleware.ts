import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import { readSessionToken } from "../utils/session-cookie.util";
import { userRepository } from "../repositories/user.repository";

// La sesión viaja solo en la cookie HttpOnly mec3d_session (el header Authorization se ignora).
// verifyToken exige audiencia "session": un token de socket no autentica requests HTTP.
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = readSessionToken(req);

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
