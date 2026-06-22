import { z } from "zod";

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
  imagenUrl: z.string().url("Debe ser una URL válida").optional(),
  archivoUrl: z.string().url("El archivo URL debe ser válido y es obligatorio"),
  precioBase: z.number().positive("El precio debe ser un número positivo"),
  formato: z.string().optional(),
  especificaciones: specSchema.optional(),
  categoria: z.string().optional(),
});

export const createProductSchema = z.object({ body: productBodySchema });

export const updateProductSchema = z.object({ body: productBodySchema });

export const partialUpdateProductSchema = z.object({
  body: productBodySchema.partial().extend({
    archivoUrl: z.string().url("El archivo URL debe ser válido").optional(),
  }),
});
