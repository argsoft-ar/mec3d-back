import { Request, Response, NextFunction } from "express";
import { billeteraService } from "../services/billetera.service";
import { pagoService } from "../services/pago.service";
import { BilleteraQuery } from "../schemas/pago.schema";
import { PaginationQuery } from "../schemas/pagination.schema";

export const getMiBilletera = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // El usuario sale siempre del JWT: no hay forma de pedir la billetera de otro.
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const { page, limit, estado } = req.query as unknown as BilleteraQuery;
    const billetera = await billeteraService.getMiBilletera(
      userId,
      { page, limit },
      estado,
    );
    res.status(200).json(billetera);
  } catch (error) {
    next(error);
  }
};

export const listarPayoutsPendientes = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { page, limit } = req.query as unknown as PaginationQuery;
    res
      .status(200)
      .json(await billeteraService.listarPayoutsPendientes({ page, limit }));
  } catch (error) {
    next(error);
  }
};

export const marcarPayoutPagado = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { referencia } = req.body as { referencia: string };
    const movimiento = await billeteraService.marcarPayoutPagado(
      req.params.id,
      referencia,
      req.user?.id ?? null,
    );
    res.status(200).json({ message: "Payout registrado", data: movimiento });
  } catch (error) {
    next(error);
  }
};

export const reintentarReembolsosPendientes = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const resumen = await pagoService.reintentarReembolsosPendientes();
    res.status(200).json(resumen);
  } catch (error) {
    next(error);
  }
};

export const reconciliarPagosPendientes = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    res.status(200).json(await pagoService.reconciliarPagosPendientes());
  } catch (error) {
    next(error);
  }
};
