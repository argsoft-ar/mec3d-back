import { NextFunction, Request, Response } from "express";
import { catalogoService } from "../services/catalogo.service";

export const getMateriales = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // tecnologiaId ya viene validado/convertido a number por listMaterialesSchema.
    const tecnologiaId = req.query.tecnologiaId as unknown as
      | number
      | undefined;
    res.status(200).json(await catalogoService.getMateriales(tecnologiaId));
  } catch (error) {
    next(error);
  }
};

export const getTecnologias = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.status(200).json(await catalogoService.getTecnologias());
  } catch (error) {
    next(error);
  }
};
