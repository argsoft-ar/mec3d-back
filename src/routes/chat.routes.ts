import { Router } from "express";
import { getMensajes } from "../controllers/chat.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import { listarMensajesSchema } from "../schemas/chat.schema";
import { chatLimiter } from "../middlewares/rate-limit.middleware";

const router = Router();

// Historial paginado de mensajes: solo accesible para los participantes (auth se
// verifica en la capa de servicio contra comprador_id/fabricante_id)
router.get(
  "/:id/mensajes",
  authenticateToken,
  chatLimiter,
  validateSchema(listarMensajesSchema),
  getMensajes,
);

export default router;
