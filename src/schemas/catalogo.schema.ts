import { z } from "zod";

export const listMaterialesSchema = z.object({
  query: z.object({
    tecnologiaId: z
      .string()
      .regex(/^\d{1,9}$/, "tecnologiaId debe ser un entero positivo")
      .transform(Number)
      .optional(),
  }),
});
