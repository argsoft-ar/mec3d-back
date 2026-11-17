import { Router } from "express";
import {
  getMensajes,
  getMisConversaciones,
  getNoLeidos,
  marcarLeida,
} from "../controllers/chat.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validateSchema } from "../middlewares/validate.middleware";
import {
  conversacionIdSchema,
  listarMensajesSchema,
} from "../schemas/chat.schema";
import { chatLimiter } from "../middlewares/rate-limit.middleware";

const router = Router();

// Lista todas las conversaciones (como comprador o fabricante) del usuario autenticado
router.get("/mias", authenticateToken, chatLimiter, getMisConversaciones);

// Total de mensajes no leídos del usuario (antes de las rutas /:id)
router.get("/no-leidos", authenticateToken, chatLimiter, getNoLeidos);

router.post(
  "/:id/leer",
  authenticateToken,
  chatLimiter,
  validateSchema(conversacionIdSchema),
  marcarLeida,
);

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
