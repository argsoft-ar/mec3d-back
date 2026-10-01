import { Request, Response, NextFunction } from "express";
import { compraService } from "../services/compra.service";

export const crearCompra = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // El id_comprador nunca se toma del body: siempre se deriva del JWT (evita IDOR/mass-assignment).
    const compradorId = req.user?.id;
    if (!compradorId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { disenoId } = req.body;

    const { compra, tokenVerificacion } = await compraService.crear(
      disenoId,
      compradorId,
    );

    res.status(201).json({
      message: "Compra registrada exitosamente",
      data: compra,
      tokenVerificacion,
    });
  } catch (error) {
    next(error);
  }
};

export const getMisCompras = async (
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
    const compras = await compraService.misCompras(compradorId);
    res.status(200).json(compras);
  } catch (error) {
    next(error);
  }
};

export const descargarArchivo = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const archivoUrl = await compraService.getArchivoDescarga(id, userId);
    res.redirect(302, archivoUrl);
  } catch (error) {
    next(error);
  }
};

export const confirmarEntrega = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { token } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const compra = await compraService.confirmarEntrega(id, token, userId);
    res.status(200).json({
      message: "Entrega confirmada, fondos liberados",
      data: compra,
    });
  } catch (error) {
    next(error);
  }
};
