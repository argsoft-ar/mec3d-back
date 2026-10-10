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

// zonaId (código INDEC) como query param: solo dígitos, hasta 8, convertido a number.
export const zonaIdQuerySchema = z
  .string()
  .regex(/^\d{1,8}$/, "zonaId debe ser un código INDEC numérico de hasta 8 dígitos")
  .transform(Number);

export const MAX_FABRICANTES_PAGE_SIZE = 50;

// Paginación de listados de fabricantes: tope duro de 50 por página.
export const fabricantesPaginationQuery = {
  page: z
    .string()
    .regex(/^\d{1,6}$/, "page debe ser un número entero positivo")
    .transform(Number)
    .default("1")
    .refine((n) => n >= 1, "page debe ser mayor o igual a 1"),
  limit: z
    .string()
    .regex(/^\d{1,3}$/, "limit debe ser un número entero positivo")
    .transform(Number)
    .default("50")
    .refine(
      (n) => n >= 1 && n <= MAX_FABRICANTES_PAGE_SIZE,
      `limit debe estar entre 1 y ${MAX_FABRICANTES_PAGE_SIZE}`,
    ),
};
