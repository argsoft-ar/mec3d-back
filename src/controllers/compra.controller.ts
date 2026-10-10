import { Request, Response, NextFunction } from "express";
import { compraService } from "../services/compra.service";
import { pagoService } from "../services/pago.service";

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
    const { disenoId, tipo, material } = req.body;

    const { compra, initPoint } = await compraService.crear(
      disenoId,
      compradorId,
      tipo,
      material,
    );

    res.status(201).json({ compra, initPoint });
  } catch (error) {
    next(error);
  }
};

export const pagarCompra = async (
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
    const resultado = await compraService.pagar(req.params.id, compradorId);
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
};

export const getEstadoPago = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    res.status(200).json(await pagoService.getEstadoPago(req.params.id, userId));
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
    res.set("Cache-Control", "no-store");
    res.redirect(302, archivoUrl);
  } catch (error) {
    next(error);
  }
};
