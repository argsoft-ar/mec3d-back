import { z } from "zod";

export const crearCompraSchema = z.object({
  body: z.object({
    disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
  }),
});

export const confirmarEntregaBodySchema = z.object({
  body: z.object({
    token: z.string().min(16, "Token de verificación inválido"),
  }),
});
