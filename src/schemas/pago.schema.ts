import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// Notificación de Mercado Pago (solo se usan estos campos; el resto se ignora).
export const webhookNotificationSchema = z
  .object({
    id: z.union([z.string().max(100), z.number()]).optional(),
    type: z.string().max(50).optional(),
    topic: z.string().max(50).optional(),
    action: z.string().max(50).optional(),
    data: z
      .object({ id: z.union([z.string().max(100), z.number()]).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

// El id del recurso viaja como query param "data.id" (es lo que firma MP).
export const webhookQuerySchema = z
  .object({
    "data.id": z.string().max(100).optional(),
    type: z.string().max(50).optional(),
    topic: z.string().max(50).optional(),
  })
  .passthrough();

const estadosBilletera = ["retenido", "pendiente_payout", "pagado"] as const;

export const billeteraQuerySchema = z.object({
  query: paginationSchema.shape.query.extend({
    estado: z.enum(estadosBilletera).optional(),
  }),
});

export const payoutsPendientesQuerySchema = paginationSchema;

export const marcarPayoutPagadoSchema = z.object({
  body: z.object({
    // Identificador de la transferencia hecha fuera de la plataforma.
    referencia: z.string().trim().min(1).max(255),
  }),
});

export type BilleteraQuery = z.infer<typeof billeteraQuerySchema>["query"];
