// Categoría del catálogo cuyos diseños son planos técnicos (PDF/DWG/DXF): no se fabrican y
// no usan tecnología ni materiales.
export const CATEGORIA_PLANOS_TECNICOS = "Planos técnicos";

export const FORMATOS_PLANO = ["PDF", "DWG", "DXF"] as const;

// Extensiones (sin punto, en minúsculas) de los archivos de diseño.
export const EXTENSIONES_PLANO = ["pdf", "dwg", "dxf"] as const;
export const EXTENSIONES_MODELO = ["stl", "3mf", "obj", "step", "stp"] as const;

export const MSG_PLANO_SIN_FABRICACION =
  "Los planos técnicos solo se pueden adquirir como descarga; no admiten fabricación";

export const MSG_FORMATO_PLANO = `El formato de un plano técnico es obligatorio y debe ser ${FORMATOS_PLANO.join(", ")}`;

export function esFormatoPlano(formato: string | null | undefined): boolean {
  return (FORMATOS_PLANO as readonly string[]).includes(formato ?? "");
}

// El catálogo resuelve categorías sin distinguir mayúsculas, así que acá tampoco.
export function esCategoriaPlano(nombre: string | null | undefined): boolean {
  return (
    typeof nombre === "string" &&
    nombre.trim().toLowerCase() === CATEGORIA_PLANOS_TECNICOS.toLowerCase()
  );
}

// Extensión (sin punto, minúsculas) del path de la URL o clave de R2; ignora query y fragmento.
export function extensionDeArchivoUrl(archivoUrl: string): string | null {
  let ruta: string;
  try {
    ruta = new URL(archivoUrl).pathname;
  } catch {
    ruta = archivoUrl.split(/[?#]/)[0];
  }
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    // Escape inválido: se usa la ruta tal cual.
  }
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : null;
}

// Mensaje de error si el archivo no es coherente con la categoría (y el formato, en planos);
// null si es válido. Para planos, `formato` ya debe haberse validado con esFormatoPlano.
export function validarArchivoSegunCategoria(
  archivoUrl: string,
  formato: string | null | undefined,
  esPlano: boolean,
): string | null {
  const ext = extensionDeArchivoUrl(archivoUrl);
  if (esPlano) {
    if (!ext || !(EXTENSIONES_PLANO as readonly string[]).includes(ext)) {
      return "El archivo de un plano técnico debe ser .pdf, .dwg o .dxf";
    }
    if (ext !== (formato ?? "").toLowerCase()) {
      return `La extensión del archivo (.${ext}) no coincide con el formato indicado (${formato ?? "sin formato"})`;
    }
    return null;
  }
  if (ext && (EXTENSIONES_PLANO as readonly string[]).includes(ext)) {
    return `Un archivo .${ext} solo se admite en la categoría "${CATEGORIA_PLANOS_TECNICOS}"`;
  }
  if (!ext || !(EXTENSIONES_MODELO as readonly string[]).includes(ext)) {
    return "El archivo del diseño debe ser un modelo 3D (STL, 3MF, OBJ, STEP/STP)";
  }
  return null;
}
