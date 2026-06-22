"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partialUpdateProductSchema = exports.updateProductSchema = exports.createProductSchema = void 0;
const zod_1 = require("zod");
const specSchema = zod_1.z.object({
    material: zod_1.z.enum(["PLA", "PLA+", "PETG", "ABS", "TPU", "Nylon", "Resina"]),
    dimensiones: zod_1.z.string().min(1, "Las dimensiones son requeridas"),
    dificultad: zod_1.z.enum(["Básico", "Intermedio", "Avanzado"]),
    tiempoImpresion: zod_1.z.string().min(1, "El tiempo de impresión es requerido"),
    soportes: zod_1.z.enum(["Necesarios", "No necesarios"]),
    configuracion: zod_1.z.object({
        layer: zod_1.z.enum(["0.1mm", "0.15mm", "0.2mm", "0.3mm"]),
        infill: zod_1.z.enum(["15%", "20%", "25%", "30%", "40%", "50%", "60%"]),
    }),
});
const productBodySchema = zod_1.z.object({
    titulo: zod_1.z.string().min(3, "El título debe tener al menos 3 caracteres"),
    descripcion: zod_1.z.string().optional(),
    imagenUrl: zod_1.z.string().url("Debe ser una URL válida").optional(),
    archivoUrl: zod_1.z.string().url("El archivo URL debe ser válido y es obligatorio"),
    precioBase: zod_1.z.number().positive("El precio debe ser un número positivo"),
    formato: zod_1.z.string().optional(),
    especificaciones: specSchema.optional(),
    categoria: zod_1.z.string().optional(),
});
exports.createProductSchema = zod_1.z.object({ body: productBodySchema });
exports.updateProductSchema = zod_1.z.object({ body: productBodySchema });
exports.partialUpdateProductSchema = zod_1.z.object({
    body: productBodySchema.partial().extend({
        archivoUrl: zod_1.z.string().url("El archivo URL debe ser válido").optional(),
    }),
});
