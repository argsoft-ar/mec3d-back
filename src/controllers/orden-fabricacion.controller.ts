import { Request, Response, NextFunction } from "express";
import { ordenFabricacionService } from "../services/orden-fabricacion.service";

export const crearOrdenesFabricacion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const compradorId = req.user?.id;
    if (!compradorId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { compraId, fabricanteIds } = req.body;

    const ordenes = await ordenFabricacionService.crear(
      compraId,
      fabricanteIds,
      compradorId,
    );

    res.status(201).json({
      message: "Solicitudes de fabricación creadas",
      data: ordenes,
    });
  } catch (error) {
    next(error);
  }
};

export const getFabricantesSugeridos = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const disenoId = req.query.disenoId as string;
    const fabricantes =
      await ordenFabricacionService.fabricantesSugeridos(disenoId);
    res.status(200).json(fabricantes);
  } catch (error) {
    next(error);
  }
};

export const proponerPrecio = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { precio } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const orden = await ordenFabricacionService.proponerPrecio(
      id,
      precio,
      userId,
    );
    res
      .status(200)
      .json({ message: "Precio propuesto registrado", data: orden });
  } catch (error) {
    next(error);
  }
};

export const cerrarTrato = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { precio } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const orden = await ordenFabricacionService.cerrarTrato(id, precio, userId);
    res
      .status(200)
      .json({ message: "Confirmación de cierre registrada", data: orden });
  } catch (error) {
    next(error);
  }
};
