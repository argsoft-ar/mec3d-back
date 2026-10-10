import { Request, Response, NextFunction } from "express";
import { pagoService } from "../services/pago.service";

// Endpoint público de Mercado Pago: la autenticidad se verifica por x-signature (HMAC) en el
// service. La firma cubre data.id, x-request-id y ts, no el body, por eso no hace falta raw body.
export const webhookMercadoPago = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { httpStatus, resultado } = await pagoService.procesarWebhook({
      query: req.query,
      body: req.body,
      xSignature: req.header("x-signature"),
      xRequestId: req.header("x-request-id"),
    });
    res.status(httpStatus).json({ resultado });
  } catch (error) {
    next(error);
  }
};
