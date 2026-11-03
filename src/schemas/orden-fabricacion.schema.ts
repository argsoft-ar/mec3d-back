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

export const MAX_ZONAS_FILTRO = 50;

// Acepta parámetros repetidos (?p=06&p=02) o separados por coma (?p=06,02). qs convierte
// listas largas en objeto {0:..,1:..}: se toman sus valores (la regex valida cada uno).
function codigosZonaQuery(
  campo: string,
  regex: RegExp,
  mensaje: string,
  normalizar: (codigo: string) => string,
) {
  return z.preprocess(
    (valor) => {
      if (valor === undefined) return undefined;
      let lista: unknown[] = [valor];
      if (Array.isArray(valor)) lista = valor;
      else if (typeof valor === "object" && valor !== null)
        lista = Object.values(valor);
      return lista
        .flatMap((v) => (typeof v === "string" ? v.split(",") : [v]))
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== "");
    },
    z
      .array(z.string().regex(regex, mensaje))
      .max(
        MAX_ZONAS_FILTRO,
        `${campo} admite hasta ${MAX_ZONAS_FILTRO} valores`,
      )
      .transform((codigos) => [...new Set(codigos.map(normalizar))])
      .optional(),
  );
}

// Los códigos de provincias 01-09 pueden llegar sin el cero inicial (zona_id es INTEGER).
const provinciasFiltroSchema = codigosZonaQuery(
  "provincias",
  /^\d{1,2}$/,
  "Cada provincia debe ser un código INDEC de 2 dígitos",
  (c) => c.padStart(2, "0"),
);
const departamentosFiltroSchema = codigosZonaQuery(
  "departamentos",
  /^\d{4,5}$/,
  "Cada departamento debe ser un código INDEC de 5 dígitos",
  (c) => c.padStart(5, "0"),
);
// Localidad censal INDEC (8 dígitos) o id de localidad Georef/BAHRA (11 dígitos).
const localidadesFiltroSchema = codigosZonaQuery(
  "localidades",
  /^(\d{7,8}|\d{10,11})$/,
  "Cada localidad debe ser un código de 8 u 11 dígitos",
  (c) => c.padStart(c.length <= 8 ? 8 : 11, "0"),
);

export const fabricantesSugeridosSchema = z.object({
  query: z.object({
    disenoId: z.string().uuid("disenoId debe ser un UUID válido"),
    // La compra de fabricación del comprador que consulta (verifica dueño y estado).
    compraId: z.string().uuid("compraId debe ser un UUID válido"),
    material: z.string().trim().min(1).max(100).optional(),
    provincias: provinciasFiltroSchema,
    departamentos: departamentosFiltroSchema,
    localidades: localidadesFiltroSchema,
    ...fabricantesPaginationQuery,
  }),
});

export type FabricantesSugeridosQuery = z.infer<
  typeof fabricantesSugeridosSchema
>["query"];

export const proponerPrecioBodySchema = z.object({
  body: z.object({
    precio: precioSchema,
  }),
});

// precio = presupuesto vigente del fabricante que el comprador acepta (evita aceptar uno viejo).
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
      .max(
        MAX_MOTIVO_DISPUTA,
        `El motivo no puede superar los ${MAX_MOTIVO_DISPUTA} caracteres`,
      ),
  }),
});

export const RESOLUCIONES_DISPUTA = [
  "liberar_fabricante",
  "reembolsar_comprador",
] as const;

export const resolverDisputaSchema = z.object({
  params: z.object({
    ordenId: z.string().uuid("El ID de la orden debe ser un UUID válido"),
  }),
  body: z.object({
    resolucion: z.enum(RESOLUCIONES_DISPUTA, {
      error: "resolucion debe ser liberar_fabricante o reembolsar_comprador",
    }),
    nota: z
      .string()
      .trim()
      .min(1, "La nota es obligatoria")
      .max(
        MAX_MOTIVO_DISPUTA,
        `La nota no puede superar los ${MAX_MOTIVO_DISPUTA} caracteres`,
      ),
  }),
});

export const disputasQuerySchema = z.object({
  query: paginationSchema.shape.query.extend({
    estado: z.enum(["abiertas", "resueltas"]).default("abiertas"),
  }),
});

export type DisputasQuery = z.infer<typeof disputasQuerySchema>["query"];
