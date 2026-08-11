import { z } from "zod";

// Schema para validar UUID en params
export const uuidParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("El ID debe ser un UUID válido"),
  }),
});

// Schema para validar ID numérico en params
export const numericIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, "El ID debe ser un número").transform(Number),
  }),
});
