import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// Solo permite URLs http(s): bloquea esquemas peligrosos (javascript:, data:, file:, etc.)
// que podrían inyectarse en imagenUrl/archivoUrl y ejecutarse si el frontend los usa como href/src.
const httpUrlSchema = (message: string) =>
  z
    .string()
    .url(message)
    .refine((val) => {
      try {
        const protocol = new URL(val).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "La URL debe usar protocolo http o https");

const specSchema = z.object({
  material: z.enum(["PLA", "PLA+", "PETG", "ABS", "TPU", "Nylon", "Resina"]),
  dimensiones: z.string().min(1, "Las dimensiones son requeridas"),
  dificultad: z.enum(["Básico", "Intermedio", "Avanzado"]),
  tiempoImpresion: z.string().min(1, "El tiempo de impresión es requerido"),
  soportes: z.enum(["Necesarios", "No necesarios"]),
  configuracion: z.object({
    layer: z.enum(["0.1mm", "0.15mm", "0.2mm", "0.3mm"]),
    infill: z.enum(["15%", "20%", "25%", "30%", "40%", "50%", "60%"]),
  }),
});

const productBodySchema = z.object({
  titulo: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  descripcion: z.string().optional(),
  imagenUrl: httpUrlSchema("Debe ser una URL válida").optional(),
  archivoUrl: httpUrlSchema("El archivo URL debe ser válido y es obligatorio"),
  precioBase: z.number().positive("El precio debe ser un número positivo"),
  formato: z.string().optional(),
  especificaciones: specSchema.optional(),
  categoria: z.string().optional(),
});

export const createProductSchema = z.object({ body: productBodySchema });

export const updateProductSchema = z.object({ body: productBodySchema });

export const partialUpdateProductSchema = z.object({
  body: productBodySchema.partial().extend({
    archivoUrl: httpUrlSchema("El archivo URL debe ser válido").optional(),
  }),
});

// Listado de productos: paginación + zonaId opcional (código INDEC) para ordenar por cercanía
export const listProductsSchema = z.object({
  query: paginationSchema.shape.query.extend({
    zonaId: z
      .string()
      .regex(/^\d{1,8}$/, "zonaId debe ser un código INDEC numérico de hasta 8 dígitos")
      .transform(Number)
      .optional(),
  }),
});
