import { z } from "zod";

export const crearCompraSchema = z.object({
  body: z.object({
    disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
  }),
});
