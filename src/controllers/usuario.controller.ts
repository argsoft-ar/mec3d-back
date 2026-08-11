import { Request, Response, NextFunction } from "express";
import { userRepository } from "../repositories/user.repository";

export const getMyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
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
    const { materiales } = req.body;
    const result = await userRepository.setMateriales(req.user!.id, materiales);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
