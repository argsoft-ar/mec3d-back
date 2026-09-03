import { Request, Response, NextFunction } from "express";
import { usuarioService } from "../services/usuario.service";
import { UpdateProfileDTO } from "../interfaces/user.interface";
import { generateToken } from "../utils/jwt.util";
import type { TokenPayload } from "../interfaces/auth.interface";

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
    const zonaId = req.query.zonaId
      ? Number.parseInt(req.query.zonaId as string, 10)
      : undefined;
    const fabricantes = await usuarioService.getFabricantesCercanos(zonaId);
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
    const profile = await usuarioService.getProfile(req.params.id);
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
    const token = generateToken(payload);
    res.status(200).json({ ...result, token });
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
    await usuarioService.changeRol(req.user!.id, "comprador");
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
