import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Debe ser un email válido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    rol_principal: z.enum(['comprador', 'disenador', 'fabricante', 'admin'], {
      errorMap: () => ({ message: 'Rol no válido. Debe ser comprador, disenador, fabricante o admin' })
    }),
    zona_id: z.number().int().positive('La zona debe ser un número entero positivo').optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Debe ser un email válido'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
  }),
});
