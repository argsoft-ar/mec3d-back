"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCreateUserSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
// Roles permitidos en registro público (SIN admin)
const publicRoles = ['comprador', 'disenador', 'fabricante'];
// Todos los roles (para uso interno/admin)
const allRoles = ['comprador', 'disenador', 'fabricante', 'admin'];
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Debe ser un email válido'),
        password: zod_1.z.string()
            .min(8, 'La contraseña debe tener al menos 8 caracteres')
            .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
            .regex(/[0-9]/, 'Debe contener al menos un número'),
        rolPrincipal: zod_1.z.enum(publicRoles, {
            errorMap: () => ({ message: 'Rol no válido. Debe ser comprador, disenador o fabricante' })
        }),
        zonaId: zod_1.z.number().int().positive('La zona debe ser un número entero positivo').optional(),
    }),
});
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Debe ser un email válido'),
        password: zod_1.z.string().min(1, 'La contraseña es obligatoria'),
    }),
});
// Schema para que admins creen usuarios (incluye rol admin)
exports.adminCreateUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Debe ser un email válido'),
        password: zod_1.z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
        rolPrincipal: zod_1.z.enum(allRoles, {
            errorMap: () => ({ message: 'Rol no válido' })
        }),
        zonaId: zod_1.z.number().int().positive().optional(),
    }),
});
