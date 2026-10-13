import type { UploadTipo } from "../interfaces/upload.interface";

const R2_MODELOS_PREFIX = "mec3d/modelos/";
const CLOUDINARY_PORTADAS_PREFIX = "mec3d/portadas/";
const CLOUDINARY_HOST = "res.cloudinary.com";

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Clave del objeto en R2 si la URL pertenece a nuestro bucket (R2_PUBLIC_URL) y a la carpeta
// de modelos subidos por la plataforma; null en cualquier otro caso.
export function extractR2Key(
  archivoUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!env.R2_PUBLIC_URL) return null;
  const url = parseUrl(archivoUrl);
  const base = parseUrl(env.R2_PUBLIC_URL);
  if (!url || !base) return null;
  if (url.origin !== base.origin) return null;

  const basePath = base.pathname.replace(/\/+$/, "");
  if (!url.pathname.startsWith(`${basePath}/`)) return null;

  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice(basePath.length + 1));
  } catch {
    return null;
  }
  if (!key.startsWith(R2_MODELOS_PREFIX) || key.includes("..")) return null;
  return key;
}

// public_id de una portada de nuestra cuenta de Cloudinary (sin versión ni extensión).
export function extractCloudinaryKey(
  imagenUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const url = parseUrl(imagenUrl);
  if (!cloudName || !url || url.hostname.toLowerCase() !== CLOUDINARY_HOST)
    return null;
  if (!url.pathname.startsWith(`/${cloudName}/`)) return null;

  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const idx = path.indexOf(`/${CLOUDINARY_PORTADAS_PREFIX}`);
  if (idx === -1) return null;
  const key = path.slice(idx + 1).replace(/\.[A-Za-z0-9]+$/, "");
  if (key.includes("..") || key === CLOUDINARY_PORTADAS_PREFIX) return null;
  return key;
}

export function claveUploadDesdeUrl(
  url: string,
  tipo: UploadTipo,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return tipo === "modelo"
    ? extractR2Key(url, env)
    : extractCloudinaryKey(url, env);
}
