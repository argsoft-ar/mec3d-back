"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Debe ser un email válido'),
        password: zod_1.z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
        rol_principal: zod_1.z.enum(['comprador', 'disenador', 'fabricante', 'admin'], {
            errorMap: () => ({ message: 'Rol no válido. Debe ser comprador, disenador, fabricante o admin' })
        }),
        zona_id: zod_1.z.number().int().positive('La zona debe ser un número entero positivo').optional(),
    }),
});
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Debe ser un email válido'),
        password: zod_1.z.string().min(1, 'La contraseña es obligatoria'),
    }),
});
