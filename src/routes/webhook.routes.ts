import express, { Router } from "express";
import { webhookMercadoPago } from "../controllers/pago.controller";
import { webhookLimiter } from "../middlewares/rate-limit.middleware";
import { bodyParseErrorHandler } from "../middlewares/error.middleware";

const router = Router();

// Una notificación de MP pesa unos cientos de bytes.
const WEBHOOK_BODY_LIMIT = "10kb";

// Público a propósito (lo invoca Mercado Pago): sin JWT, autenticado por x-signature. El
// limiter corre ANTES del parser (no se parsea el body de quien ya excedió el límite) y el
// parser tiene su propio tope de tamaño; esta ruta se monta antes del express.json global.
router.post(
  "/mercadopago",
  webhookLimiter,
  express.json({ limit: WEBHOOK_BODY_LIMIT }),
  webhookMercadoPago,
);
router.use(bodyParseErrorHandler);

export default router;
