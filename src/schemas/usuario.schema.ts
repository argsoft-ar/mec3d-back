import { z } from "zod";
import {
  zonaIdQuerySchema,
  fabricantesPaginationQuery,
  usernameSchema,
  usernameFormatSchema,
} from "./common.schema";
import { esCuentaMercadopagoValida } from "../utils/policy.util";

const sinDuplicados = (items: string[]) =>
  new Set(items.map((i) => i.toLowerCase())).size === items.length;

export const updateProfileSchema = z.object({
  body: z.object({
    tagline: z.string().max(255).optional(),
    descripcion: z.string().max(2000).optional(),
    experiencia: z.string().max(2000).optional(),
    zonaId: z.number().int().positive().max(99_999_999).optional(),
    // "" borra la cuenta; si no, CBU/CVU (22 dígitos), alias (6-20) o email.
    cuentaMercadopago: z
      .string()
      .trim()
      .max(255)
      .refine((v) => v === "" || esCuentaMercadopagoValida(v), {
        message:
          "cuentaMercadopago debe ser un CBU/CVU de 22 dígitos, un alias (6-20 caracteres) o un email",
      })
      .optional(),
    username: usernameSchema.optional(),
    telefono: z.string().max(30).optional(),
    direccion: z.string().max(255).optional(),
  }),
});

export const checkUsernameSchema = z.object({
  query: z.object({
    username: usernameFormatSchema,
  }),
});

export const setMaterialesSchema = z.object({
  body: z.object({
    materiales: z
      .array(z.string().trim().min(1).max(100))
      .min(1, "Debe indicar al menos un material")
      .max(50, "No se pueden registrar más de 50 materiales")
      .refine(sinDuplicados, "Los materiales no pueden repetirse"),
  }),
});

export const getFabricantesSchema = z.object({
  query: z.object({
    zonaId: zonaIdQuerySchema.optional(),
    ...fabricantesPaginationQuery,
  }),
});

export const changeRolSchema = z.object({
  body: z.object({
    rol: z.enum(["comprador", "disenador", "fabricante"], {
      error: "Rol debe ser comprador, disenador o fabricante",
    }),
  }),
});

export const setTecnologiasSchema = z.object({
  body: z.object({
    tecnologias: z
      .array(z.string().trim().min(1).max(100))
      .max(20, "No se pueden registrar más de 20 tecnologías")
      .refine(sinDuplicados, "Las tecnologías no pueden repetirse"),
  }),
});
