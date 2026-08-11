import { Request, Response, NextFunction } from "express";
<<<<<<< HEAD
import { userRepository } from "../repositories/user.repository";
=======
import { usuarioService } from "../services/usuario.service";
import { UpdateProfileDTO } from "../interfaces/user.interface";
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563

export const getMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
<<<<<<< HEAD
    const user = await userRepository.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.status(200).json({
      id: user.id,
      email: user.email,
      rolPrincipal: user.rol_principal,
      zonaId: user.zona_id,
      puntuacion: parseFloat(user.puntuacion),
      cuentaMercadopago: user.cuenta_mercadopago,
      tagline: user.tagline,
      descripcion: user.descripcion,
      experiencia: user.experiencia,
      actualizadoEn: user.actualizado_en,
      georefLocalidadId: user.georef_localidad_id,
      materiales: user.materiales,
    });
=======
    const profile = await usuarioService.getProfile(req.user!.id);
    res.status(200).json(profile);
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563
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
<<<<<<< HEAD
    const updated = await userRepository.updateUser(req.user!.id, req.body);
    if (!updated) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.status(200).json({
      id: updated.id,
      email: updated.email,
      rolPrincipal: updated.rol_principal,
      zonaId: updated.zona_id,
      puntuacion: parseFloat(updated.puntuacion),
      cuentaMercadopago: updated.cuenta_mercadopago,
      tagline: updated.tagline,
      descripcion: updated.descripcion,
      experiencia: updated.experiencia,
      actualizadoEn: updated.actualizado_en,
      georefLocalidadId: updated.georef_localidad_id,
      materiales: updated.materiales,
    });
=======
    const data: UpdateProfileDTO = req.body;
    const updated = await usuarioService.updateProfile(req.user!.id, data);
    res.status(200).json(updated);
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563
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
<<<<<<< HEAD
    const { materiales } = req.body;
    const result = await userRepository.setMateriales(req.user!.id, materiales);
=======
    const { materiales } = req.body as { materiales: string[] };
    const result = await usuarioService.setMateriales(
      req.user!.id,
      req.user!.rolPrincipal,
      materiales,
    );
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
<<<<<<< HEAD
=======

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
>>>>>>> 66549a9bf38a3e718f7aec891172095d7258d563
