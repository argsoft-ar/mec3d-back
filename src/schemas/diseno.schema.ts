import { z } from 'zod';

const specSchema = z.object({
  title: z.string().min(1, 'El título de la especificación es requerido'),
  value: z.string().min(1, 'El valor de la especificación es requerido'),
});

export const createProductSchema = z.object({
  body: z.object({
    titulo: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
    descripcion: z.string().optional(),
    imagenUrl: z.string().url('Debe ser una URL válida').optional(),
    archivoUrl: z.string().url('El archivo URL debe ser válido y es obligatorio'),
    precioBase: z.number().positive('El precio debe ser un número positivo'),
    formato: z.string().optional(),
    especificaciones: z.array(specSchema).optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    titulo: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
    descripcion: z.string().optional(),
    imagenUrl: z.string().url('Debe ser una URL válida').optional(),
    archivoUrl: z.string().url('El archivo URL debe ser válido y es obligatorio'),
    precioBase: z.number().positive('El precio debe ser un número positivo'),
    formato: z.string().optional(),
    especificaciones: z.array(specSchema).optional(),
  }),
});

export const partialUpdateProductSchema = z.object({
  body: z.object({
    titulo: z.string().min(3, 'El título debe tener al menos 3 caracteres').optional(),
    descripcion: z.string().optional(),
    imagenUrl: z.string().url('Debe ser una URL válida').optional(),
    archivoUrl: z.string().url('El archivo URL debe ser válido').optional(),
    precioBase: z.number().positive('El precio debe ser un número positivo').optional(),
    formato: z.string().optional(),
    especificaciones: z.array(specSchema).optional(),
  }),
});
