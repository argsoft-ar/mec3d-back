import { z } from "zod";
import { usernameSchema, usernameFormatSchema } from "./common.schema";

// Roles permitidos en registro público (SIN admin)
const publicRoles = ["comprador", "disenador", "fabricante"] as const;

// Todos los roles (para uso interno/admin)
const allRoles = ["comprador", "disenador", "fabricante", "admin"] as const;

// Reglas de email y contraseña del registro; las reutiliza también `db:bootstrap`.
export const emailSchema = z
  .string()
  .email("Debe ser un email válido")
  .max(255, "El email no puede superar los 255 caracteres");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar los 72 caracteres")
  .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
  .regex(/\d/, "Debe contener al menos un número");

export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    rolPrincipal: z.enum(publicRoles, {
      errorMap: () => ({
        message: "Rol no válido. Debe ser comprador, disenador o fabricante",
      }),
    }),
    zonaId: z
      .number()
      .int()
      .positive("La zona debe ser un número entero positivo")
      .max(
        99_999_999,
        "La zona debe ser un código INDEC válido (máx. 8 dígitos)",
      )
      .optional(),
    georefLocalidadId: z.string().max(20).optional(),
  }),
});

export const checkUsernameDisponibleSchema = z.object({
  query: z.object({
    username: usernameFormatSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Debe ser un email válido"),
    password: z.string().min(1, "La contraseña es obligatoria"),
  }),
});

// Schema para que admins creen usuarios (incluye rol admin)
export const adminCreateUserSchema = z.object({
  body: z.object({
    email: z.string().email("Debe ser un email válido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    rolPrincipal: z.enum(allRoles, {
      errorMap: () => ({ message: "Rol no válido" }),
    }),
    zonaId: z.number().int().positive().max(99_999_999).optional(),
  }),
});
