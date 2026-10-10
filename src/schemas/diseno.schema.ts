import { z } from "zod";
import { paginationSchema } from "./pagination.schema";
import { zonaIdQuerySchema } from "./common.schema";

export type AssetKind = "archivo" | "imagen";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CLOUDINARY_HOST = "res.cloudinary.com";
// Prefijos de las claves/carpetas que generan nuestros propios uploads (upload.service.ts).
const R2_MODELOS_PREFIX = "/mec3d/modelos/";
const CLOUDINARY_PORTADAS_FOLDER = "/mec3d/portadas/";

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalDev(url: URL, env: NodeJS.ProcessEnv): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    LOCAL_HOSTS.has(url.hostname.toLowerCase())
  );
}

// Hosts de confianza para assets: bucket público de R2, Cloudinary y los extra de
// ALLOWED_ASSET_HOSTS (lista separada por comas; p. ej. un CDN o un host legacy).
export function getAllowedAssetHosts(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const hosts = new Set<string>();
  const r2 = env.R2_PUBLIC_URL ? parseUrl(env.R2_PUBLIC_URL) : null;
  if (r2) hosts.add(r2.hostname.toLowerCase());
  if (env.CLOUDINARY_CLOUD_NAME) hosts.add(CLOUDINARY_HOST);
  for (const h of (env.ALLOWED_ASSET_HOSTS ?? "").split(",")) {
    const host = h.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

// Única función de validación de URLs de assets (imagenUrl / archivoUrl). Solo https (http
// a localhost fuera de producción), sin credenciales embebidas, y que provengan de los
// uploads propios: bucket R2 bajo mec3d/modelos/ (archivo) o Cloudinary bajo
// mec3d/portadas/ de nuestra cuenta (imagen). Los hosts de ALLOWED_ASSET_HOSTS se aceptan
// por host.
export function isAllowedAssetUrl(
  value: string,
  kind: AssetKind,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.username || url.password) return false;
  if (isLocalDev(url, env)) return true;
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;

  const host = url.hostname.toLowerCase();
  const extra = (env.ALLOWED_ASSET_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(host)) return true;

  if (kind === "archivo") {
    const r2 = env.R2_PUBLIC_URL ? parseUrl(env.R2_PUBLIC_URL) : null;
    if (!r2 || url.origin !== r2.origin) return false;
    const basePath = r2.pathname.replace(/\/+$/, "");
    return url.pathname.startsWith(`${basePath}${R2_MODELOS_PREFIX}`);
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  return (
    host === CLOUDINARY_HOST &&
    !!cloudName &&
    url.pathname.startsWith(`/${cloudName}/`) &&
    url.pathname.includes(CLOUDINARY_PORTADAS_FOLDER)
  );
}

// Host permitido para redirigir a un archivo que no es de R2 (legacy): https + allowlist.
export function isTrustedAssetHost(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = parseUrl(value);
  if (!url || url.username || url.password) return false;
  if (isLocalDev(url, env)) return true;
  return (
    url.protocol === "https:" &&
    getAllowedAssetHosts(env).has(url.hostname.toLowerCase())
  );
}

const MAX_URL_LENGTH = 2048;

const assetUrlSchema = (kind: AssetKind, message: string) =>
  z
    .string()
    .max(MAX_URL_LENGTH, "La URL es demasiado larga")
    .url(message)
    .refine(
      (val) => isAllowedAssetUrl(val, kind),
      kind === "archivo"
        ? "El archivo debe provenir de una subida a la plataforma"
        : "La imagen debe provenir de una subida a la plataforma",
    );

// tiempoImpresion son horas enteras (impresión 3D o fabricación CNC).
export const MIN_PRINT_HOURS = 1;
export const MAX_PRINT_HOURS = 500;
// DECIMAL(10,2) admite hasta 99.999.999,99; se deja un tope comercial mucho menor.
export const MAX_PRECIO_BASE = 10_000_000;
export const MAX_MATERIALES_POR_DISENO = 20;

// Precio en pesos (precioBase y precios de negociación): finito, positivo, con tope y a lo
// sumo 2 decimales para que el pasaje a centavos enteros sea exacto.
export const precioPesosSchema = z
  .number({ invalid_type_error: "El precio debe ser un número" })
  .finite("El precio debe ser un número finito")
  .positive("El precio debe ser un número positivo")
  .max(MAX_PRECIO_BASE, `El precio máximo es ${MAX_PRECIO_BASE}`)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    "El precio admite como máximo 2 decimales",
  );

const specSchema = z.object({
  dimensiones: z
    .string()
    .min(1, "Las dimensiones son requeridas")
    .max(50, "Las dimensiones no pueden superar 50 caracteres"),
  dificultad: z.enum(["Básico", "Intermedio", "Avanzado"]),
  tiempoImpresion: z
    .number({ invalid_type_error: "El tiempo de impresión debe ser un número de horas" })
    .int("El tiempo de impresión debe ser un número entero de horas")
    .min(MIN_PRINT_HOURS, `El tiempo de impresión mínimo es ${MIN_PRINT_HOURS} hora`)
    .max(MAX_PRINT_HOURS, `El tiempo de impresión máximo es ${MAX_PRINT_HOURS} horas`),
  soportes: z.enum(["Necesarios", "No necesarios"]),
  configuracion: z.object({
    layer: z.enum(["0.1mm", "0.15mm", "0.2mm", "0.3mm"]),
    infill: z.enum(["15%", "20%", "25%", "30%", "40%", "50%", "60%"]),
  }),
});

const nombreCatalogoSchema = z.string().trim().min(1).max(100);

const materialesSchema = z
  .array(nombreCatalogoSchema)
  .min(1, "Debe indicar al menos un material")
  .max(
    MAX_MATERIALES_POR_DISENO,
    `No se pueden indicar más de ${MAX_MATERIALES_POR_DISENO} materiales`,
  )
  .refine(
    (items) => new Set(items.map((m) => m.toLowerCase())).size === items.length,
    "Los materiales no pueden repetirse",
  );

const productBodySchema = z.object({
  titulo: z
    .string()
    .min(3, "El título debe tener al menos 3 caracteres")
    .max(255, "El título no puede superar 255 caracteres"),
  descripcion: z
    .string()
    .max(5000, "La descripción no puede superar 5000 caracteres")
    .optional(),
  imagenUrl: assetUrlSchema("imagen", "Debe ser una URL válida").optional(),
  archivoUrl: assetUrlSchema(
    "archivo",
    "El archivo URL debe ser válido y es obligatorio",
  ),
  precioBase: precioPesosSchema,
  formato: z.string().max(50, "El formato no puede superar 50 caracteres").optional(),
  especificaciones: specSchema.optional(),
  categoria: z
    .string()
    .trim()
    .min(1)
    .max(100, "La categoría no puede superar 100 caracteres")
    .optional(),
  tecnologia: nombreCatalogoSchema,
  materiales: materialesSchema,
});

export const createProductSchema = z.object({ body: productBodySchema });

export const updateProductSchema = z.object({ body: productBodySchema });

export const partialUpdateProductSchema = z.object({
  body: productBodySchema.partial(),
});

// Listado de productos: paginación + zonaId opcional (código INDEC) para ordenar por cercanía
// + categoria opcional (filtro por nombre del catálogo)
export const listProductsSchema = z.object({
  query: paginationSchema.shape.query.extend({
    categoria: z.string().trim().min(1).max(100).optional(),
    zonaId: zonaIdQuerySchema.optional(),
  }),
});
