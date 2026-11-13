import { Request, Response, NextFunction } from "express";
import { usuarioService } from "../services/usuario.service";
import { authService } from "../services/auth.service";
import { UpdateProfileDTO } from "../interfaces/user.interface";
import type { TokenPayload } from "../interfaces/auth.interface";
import { setSessionCookie } from "../utils/session-cookie.util";

export const getMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profile = await usuarioService.getProfile(req.user!.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
};

export const updateMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data: UpdateProfileDTO = req.body;
    const updated = await usuarioService.updateProfile(req.user!.id, data);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const setMisMateriales = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { materiales } = req.body as { materiales: string[] };
    const result = await usuarioService.setMateriales(req.user!.id, materiales);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getFabricantesCercanos = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // zonaId, page y limit ya vienen validados y convertidos a number por el schema.
    const { zonaId, page, limit } = req.query as unknown as {
      zonaId?: number;
      page: number;
      limit: number;
    };
    const fabricantes = await usuarioService.getFabricantesCercanos(
      zonaId,
      page,
      limit,
    );
    res.status(200).json(fabricantes);
  } catch (error) {
    next(error);
  }
};

export const getFabricanteById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profile = await usuarioService.getPublicFabricanteProfile(
      req.params.id,
    );
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
};

export const changeMyRol = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rol } = req.body as { rol: string };
    const result = await usuarioService.changeRol(req.user!.id, rol);
    const payload: TokenPayload = {
      id: req.user!.id,
      email: req.user!.email,
      rolPrincipal: rol as TokenPayload["rolPrincipal"],
    };
    // La sesión se renueva con el rol nuevo vía cookie; el token ya no va en el body.
    setSessionCookie(res, authService.createSessionToken(payload));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteFabricanteStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Solo un fabricante puede quitarse ese estado (antes cualquier rol, incluido admin,
    // quedaba degradado a comprador).
    await usuarioService.changeRol(req.user!.id, "comprador", {
      rolRequerido: "fabricante",
    });
    // Mantiene el rol de la cookie en sincronía con la DB (antes el JWT quedaba desactualizado).
    setSessionCookie(
      res,
      authService.createSessionToken({
        id: req.user!.id,
        email: req.user!.email,
        rolPrincipal: "comprador",
      }),
    );
    res.status(200).json({ message: "Estado de fabricante eliminado" });
  } catch (error) {
    next(error);
  }
};

export const setMisTecnologias = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { tecnologias } = req.body as { tecnologias: string[] };
    const result = await usuarioService.setTecnologias(
      req.user!.id,
      tecnologias,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const checkUsername = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const username = req.query.username as string;
    const result = await usuarioService.checkUsernameDisponible(
      username,
      req.user?.id,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
