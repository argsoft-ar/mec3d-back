import { z } from "zod";
import { precioPesosSchema } from "./diseno.schema";
import { fabricantesPaginationQuery } from "./common.schema";
import { paginationSchema } from "./pagination.schema";

export const MAX_FABRICANTES_POR_SOLICITUD = 10;

// Mismo validador que precioBase: finito, positivo, tope y 2 decimales máximo.
const precioSchema = precioPesosSchema;

export const crearOrdenesFabricacionSchema = z.object({
  body: z.object({
    compraId: z.string().uuid("compraId debe ser un UUID válido"),
    fabricanteIds: z
      .array(z.string().uuid("Cada fabricanteId debe ser un UUID válido"))
      .min(1, "Debe indicar al menos un fabricante")
      .max(
        MAX_FABRICANTES_POR_SOLICITUD,
        `No se pueden contactar más de ${MAX_FABRICANTES_POR_SOLICITUD} fabricantes a la vez`,
      )
      // Los repetidos se colapsan en vez de rechazarse.
      .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]),
  }),
});

export const fabricantesSugeridosSchema = z.object({
  query: z.object({
    disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
    // La compra de fabricación del comprador que consulta (verifica dueño y estado).
    compraId: z.string().uuid("compraId debe ser un UUID válido"),
    material: z.string().trim().min(1).max(100).optional(),
    ...fabricantesPaginationQuery,
  }),
});

export const proponerPrecioBodySchema = z.object({
  body: z.object({
    precio: precioSchema,
  }),
});

export const cerrarTratoBodySchema = z.object({
  body: z.object({
    precio: precioSchema,
  }),
});

export const confirmarEntregaOrdenBodySchema = z.object({
  body: z.object({
    codigo: z
      .string()
      .regex(/^\d{6}$/, "El código de entrega debe tener 6 dígitos"),
  }),
});

export const MAX_MOTIVO_DISPUTA = 1000;

export const disputarBodySchema = z.object({
  body: z.object({
    motivo: z
      .string()
      .trim()
      .min(1, "El motivo es obligatorio")
      .max(MAX_MOTIVO_DISPUTA, `El motivo no puede superar los ${MAX_MOTIVO_DISPUTA} caracteres`),
  }),
});

export const RESOLUCIONES_DISPUTA = ["liberar_fabricante", "reembolsar_comprador"] as const;

export const resolverDisputaSchema = z.object({
  params: z.object({
    ordenId: z.string().uuid("El ID de la orden debe ser un UUID válido"),
  }),
  body: z.object({
    resolucion: z.enum(RESOLUCIONES_DISPUTA, {
      errorMap: () => ({
        message: "resolucion debe ser liberar_fabricante o reembolsar_comprador",
      }),
    }),
    nota: z
      .string()
      .trim()
      .min(1, "La nota es obligatoria")
      .max(MAX_MOTIVO_DISPUTA, `La nota no puede superar los ${MAX_MOTIVO_DISPUTA} caracteres`),
  }),
});

export const disputasQuerySchema = z.object({
  query: paginationSchema.shape.query.extend({
    estado: z.enum(["abiertas", "resueltas"]).default("abiertas"),
  }),
});

export type DisputasQuery = z.infer<typeof disputasQuerySchema>["query"];
