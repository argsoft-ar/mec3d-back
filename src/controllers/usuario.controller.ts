import { Request, Response, NextFunction } from "express";
import { usuarioService } from "../services/usuario.service";
import { UpdateProfileDTO } from "../interfaces/user.interface";

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
    const result = await usuarioService.setMateriales(
      req.user!.id,
      req.user!.rolPrincipal,
      materiales,
    );
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
      ? parseInt(req.query.zonaId as string, 10)
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
