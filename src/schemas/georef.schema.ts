import { z } from "zod";

// Los IDs de Georef son códigos INDEC numéricos (ej: "06", "06427")
export const provinciaIdParamSchema = z.object({
  params: z.object({
    provinciaId: z
      .string()
      .regex(/^\d{2}$/, "El ID de provincia debe ser un código INDEC de 2 dígitos"),
  }),
});

export const localidadesQuerySchema = z.object({
  query: z.object({
    provincia: z
      .string({ required_error: "El parámetro provincia es requerido" })
      .regex(/^\d{2}$/, "El parámetro provincia debe ser un código INDEC de 2 dígitos"),
    departamento: z
      .string()
      .regex(/^\d{5}$/, "El parámetro departamento debe ser un código INDEC de 5 dígitos")
      .optional(),
  }),
});
