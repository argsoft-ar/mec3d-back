import {
  Provincia,
  Departamento,
  Localidad,
  GeorefProvinciasResponse,
  GeorefDepartamentosResponse,
  GeorefLocalidadesResponse,
} from "../interfaces/georef.interface";
import { AppError } from "../errors/app-error";

const GEOREF_BASE_URL =
  process.env.GEOREF_API_URL ?? "https://apis.datos.gob.ar/georef/api";

// Falla rápido si la env apunta a un esquema no http(s) (mitiga SSRF por configuración comprometida)
const baseUrlProtocol = new URL(GEOREF_BASE_URL).protocol;
if (baseUrlProtocol !== "https:" && baseUrlProtocol !== "http:") {
  throw new Error("GEOREF_API_URL debe ser una URL http(s) válida");
}
const REQUEST_TIMEOUT_MS = 10_000;
// Los datos geográficos casi no cambian: cache en memoria por 24 horas
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const getFromCache = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
};

// Tope de entradas para evitar crecimiento sin límite del cache en memoria
const MAX_CACHE_ENTRIES = 500;

const setInCache = (key: string, data: unknown): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
};

// Consulta la API Georef con timeout y manejo de errores de red
const fetchGeoref = async <T>(
  path: string,
  params: Record<string, string>,
): Promise<T> => {
  const url = `${GEOREF_BASE_URL}${path}?${new URLSearchParams(params)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new AppError(
        `La API Georef respondió con un error (status ${response.status})`,
        502,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(
        "Tiempo de espera agotado al consultar la API Georef",
        504,
      );
    }
    throw new AppError("No se pudo conectar con la API Georef", 502);
  } finally {
    clearTimeout(timeout);
  }
};

const sortByNombre = <T extends { nombre: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

export const georefService = {
  async getProvincias(): Promise<Provincia[]> {
    const cacheKey = "provincias";
    const cached = getFromCache<Provincia[]>(cacheKey);
    if (cached) return cached;

    const response = await fetchGeoref<GeorefProvinciasResponse>(
      "/provincias",
      { campos: "id,nombre", max: "100" },
    );

    const provincias = sortByNombre(response.provincias);
    setInCache(cacheKey, provincias);
    return provincias;
  },

  async getDepartamentos(provinciaId: string): Promise<Departamento[]> {
    const cacheKey = `departamentos:${provinciaId}`;
    const cached = getFromCache<Departamento[]>(cacheKey);
    if (cached) return cached;

    const response = await fetchGeoref<GeorefDepartamentosResponse>(
      "/departamentos",
      { provincia: provinciaId, campos: "id,nombre", max: "500" },
    );

    const departamentos = sortByNombre(response.departamentos);
    setInCache(cacheKey, departamentos);
    return departamentos;
  },

  async getLocalidades(
    provinciaId: string,
    departamentoId?: string,
  ): Promise<Localidad[]> {
    const cacheKey = `localidades:${provinciaId}:${departamentoId ?? "todas"}`;
    const cached = getFromCache<Localidad[]>(cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = {
      provincia: provinciaId,
      campos: "id,nombre",
      max: "1000",
    };
    if (departamentoId) {
      params.departamento = departamentoId;
    }

    const response = await fetchGeoref<GeorefLocalidadesResponse>(
      "/localidades",
      params,
    );

    const localidades = sortByNombre(response.localidades);
    setInCache(cacheKey, localidades);
    return localidades;
  },
};
