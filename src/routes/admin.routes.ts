import { Router } from "express";
import {
  listarPayoutsPendientes,
  marcarPayoutPagado,
  reconciliarPagosPendientes,
  reintentarReembolsosPendientes,
} from "../controllers/billetera.controller";
import {
  listarDisputas,
  resolverDisputa,
} from "../controllers/orden-fabricacion.controller";
import {
  authenticateToken,
  requireAdmin,
} from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { uuidParamSchema } from "../schemas/common.schema";
import {
  disputasQuerySchema,
  resolverDisputaSchema,
} from "../schemas/orden-fabricacion.schema";
import {
  marcarPayoutPagadoSchema,
  payoutsPendientesQuerySchema,
} from "../schemas/pago.schema";

const router = Router();

// Todo lo de este router es solo para el rol 'admin'.
router.use(authenticateToken, requireAdmin);

router.get(
  "/payouts/pendientes",
  validateSchema(payoutsPendientesQuerySchema),
  listarPayoutsPendientes,
);

router.post(
  "/payouts/:id/marcar-pagado",
  validateSchema(uuidParamSchema),
  validateSchema(marcarPayoutPagadoSchema),
  marcarPayoutPagado,
);

router.post(
  "/pagos/reembolsos-pendientes/reintentar",
  reintentarReembolsosPendientes,
);

router.post("/pagos/reconciliar", reconciliarPagosPendientes);

router.get("/disputas", validateSchema(disputasQuerySchema), listarDisputas);

router.post(
  "/disputas/:ordenId/resolver",
  validateSchema(resolverDisputaSchema),
  resolverDisputa,
);

export default router;
