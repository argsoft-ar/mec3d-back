import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    tagline: z.string().max(255).optional(),
    descripcion: z.string().max(2000).optional(),
    experiencia: z.string().max(2000).optional(),
    zonaId: z.number().int().positive().max(99_999_999).optional(),
    cuentaMercadopago: z.string().max(255).optional(),
  }),
});

export const setMaterialesSchema = z.object({
  body: z.object({
    materiales: z
      .array(z.string().min(1).max(100))
      .min(1, "Debe indicar al menos un material")
      .max(50, "No se pueden registrar más de 50 materiales"),
  }),
});

export const getFabricantesSchema = z.object({
  query: z.object({
    zonaId: z.string().regex(/^\d+$/, "zonaId debe ser numérico").optional(),
  }),
});
