import {
  catalogoRepository,
  CategoriaCatalogoRow,
  MaterialCatalogoRow,
  TecnologiaCatalogoRow,
} from "../repositories/catalogo.repository";
import { ValidationError } from "../errors/app-error";
import {
  MaterialCatalogo,
  TecnologiaCatalogo,
} from "../interfaces/catalogo.interface";

// Resuelve nombres (case-insensitive) a filas del catálogo conservando el orden pedido y
// sin duplicados; los que no existen se reportan juntos en un único error 400.
function resolverNombres<T extends { id: number; nombre: string }>(
  nombres: string[],
  encontrados: T[],
  etiqueta: string,
): T[] {
  const porNombre = new Map(
    encontrados.map((r) => [r.nombre.toLowerCase(), r]),
  );
  const inexistentes: string[] = [];
  const resueltos = new Map<number, T>();
  for (const nombre of nombres) {
    const fila = porNombre.get(nombre.trim().toLowerCase());
    if (fila) resueltos.set(fila.id, fila);
    else inexistentes.push(nombre);
  }
  if (inexistentes.length > 0) {
    throw new ValidationError(
      `${etiqueta} inexistentes en el catálogo: ${inexistentes.join(", ")}`,
    );
  }
  return [...resueltos.values()];
}

export const catalogoService = {
  async getTecnologias(): Promise<TecnologiaCatalogo[]> {
    return catalogoRepository.getTecnologias();
  },

  async getMateriales(tecnologiaId?: number): Promise<MaterialCatalogo[]> {
    const rows = await catalogoRepository.getMateriales(tecnologiaId);
    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      tecnologiaId: r.tecnologia_id,
    }));
  },

  async resolverTecnologias(
    nombres: string[],
  ): Promise<TecnologiaCatalogoRow[]> {
    if (nombres.length === 0) return [];
    const encontrados = await catalogoRepository.findTecnologiasByNombres(
      nombres.map((n) => n.trim()),
    );
    return resolverNombres(nombres, encontrados, "Tecnologías");
  },

  async resolverTecnologia(nombre: string): Promise<TecnologiaCatalogoRow> {
    const [tecnologia] = await this.resolverTecnologias([nombre]);
    return tecnologia;
  },

  // Devuelve la categoría existente (nombre canónico del catálogo); 400 si no existe (no se
  // crean categorías). Sin nombre devuelve null.
  async resolverCategoria(
    nombre: string | null | undefined,
  ): Promise<CategoriaCatalogoRow | null> {
    if (!nombre) return null;
    const categoria = await catalogoRepository.findCategoriaByNombre(
      nombre.trim(),
    );
    if (!categoria) {
      throw new ValidationError(
        `Categoría inexistente en el catálogo: ${nombre}`,
      );
    }
    return categoria;
  },

  async resolverCategoriaId(
    nombre: string | null | undefined,
  ): Promise<number | null> {
    return (await this.resolverCategoria(nombre))?.id ?? null;
  },

  async getMaterialesDeDiseno(
    disenoId: string,
  ): Promise<MaterialCatalogoRow[]> {
    return catalogoRepository.getMaterialesDeDiseno(disenoId);
  },

  // El comprador solo puede elegir entre los materiales del diseño.
  async resolverMaterialDeDiseno(
    disenoId: string,
    nombre: string,
  ): Promise<MaterialCatalogoRow> {
    const materiales = await catalogoRepository.getMaterialesDeDiseno(disenoId);
    const elegido = materiales.find(
      (m) => m.nombre.toLowerCase() === nombre.trim().toLowerCase(),
    );
    if (!elegido) {
      throw new ValidationError(
        `El material "${nombre}" no está entre los materiales del diseño`,
      );
    }
    return elegido;
  },

  // Si se indica tecnologiaId, todos los materiales deben pertenecer a esa tecnología.
  async resolverMateriales(
    nombres: string[],
    tecnologiaId?: number,
  ): Promise<MaterialCatalogoRow[]> {
    if (nombres.length === 0) return [];
    const encontrados = await catalogoRepository.findMaterialesByNombres(
      nombres.map((n) => n.trim()),
    );
    const materiales = resolverNombres(nombres, encontrados, "Materiales");
    if (tecnologiaId !== undefined) {
      const incompatibles = materiales.filter(
        (m) => m.tecnologia_id !== tecnologiaId,
      );
      if (incompatibles.length > 0) {
        throw new ValidationError(
          `Materiales no compatibles con la tecnología del diseño: ${incompatibles
            .map((m) => m.nombre)
            .join(", ")}`,
        );
      }
    }
    return materiales;
  },
};
