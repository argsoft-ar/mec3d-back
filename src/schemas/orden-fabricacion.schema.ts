import { z } from "zod";

export const crearOrdenesFabricacionSchema = z.object({
  body: z.object({
    compraId: z.string().uuid("compraId debe ser un UUID válido"),
    fabricanteIds: z
      .array(z.string().uuid("Cada fabricanteId debe ser un UUID válido"))
      .min(1, "Debe indicar al menos un fabricante"),
  }),
});

export const fabricantesSugeridosSchema = z.object({
  query: z.object({
    disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
  }),
});

export const proponerPrecioBodySchema = z.object({
  body: z.object({
    precio: z.number().positive("El precio debe ser un número positivo"),
  }),
});

export const cerrarTratoBodySchema = z.object({
  body: z.object({
    precio: z.number().positive("El precio debe ser un número positivo"),
  }),
});
