import { disenoRepository } from "../repositories/diseno.repository";
import { uploadRepository } from "../repositories/upload.repository";
import { claveUploadDesdeUrl } from "../utils/upload-key.util";
import type { UploadTipo } from "../interfaces/upload.interface";
import {
  Product,
  CreateProductDTO,
  UpdateProductDTO,
  PartialUpdateProductDTO,
} from "../interfaces/product.interface";
import {
  PaginationParams,
  PaginatedResponse,
} from "../interfaces/pagination.interface";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../errors/app-error";
import { getProvinciaPrefix, getPartidoPrefix } from "../utils/zona.util";
import { catalogoService } from "./catalogo.service";
import { archivoService, ArchivoFirmado } from "./archivo.service";

// Valida contra el catálogo (DB) que la tecnología exista y que todos los materiales
// existan y pertenezcan a esa tecnología; devuelve los ids a persistir.
async function resolverTecnologiaYMateriales(
  tecnologia: string,
  materiales: string[],
): Promise<{ tecnologiaId: number; materialIds: number[] }> {
  const tec = await catalogoService.resolverTecnologia(tecnologia);
  const mats = await catalogoService.resolverMateriales(materiales, tec.id);
  return { tecnologiaId: tec.id, materialIds: mats.map((m) => m.id) };
}

// archivoUrl / imagenUrl deben pertenecer a una subida registrada del propio usuario (tabla
// uploads). Una URL que la plataforma no conoce (legacy, anterior al registro) solo se acepta
// fuera de producción; la de otro usuario se rechaza siempre.
export async function verificarUploadsPropios(
  userId: string,
  urls: { archivoUrl?: string | null; imagenUrl?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const chequeos: [string | null | undefined, UploadTipo, string][] = [
    [urls.archivoUrl, "modelo", "archivoUrl"],
    [urls.imagenUrl, "imagen", "imagenUrl"],
  ];
  for (const [url, tipo, campo] of chequeos) {
    if (!url) continue;
    const key = claveUploadDesdeUrl(url, tipo, env);
    const duenio = key
      ? await uploadRepository.getPropietario(key, tipo)
      : null;
    if (duenio === userId) continue;
    if (duenio !== null) {
      throw new ForbiddenError(
        `${campo} corresponde a un archivo subido por otro usuario`,
      );
    }
    if (env.NODE_ENV === "production") {
      throw new ValidationError(
        `${campo} debe ser un archivo subido a través de la plataforma`,
      );
    }
  }
}

/**
 * Mapea una fila de la BD (snake_case) a la interfaz Product (camelCase)
 */
function mapRowToProduct(row: any): Product {
  const name = row.designer_name || "Anónimo";
  const initials = name.substring(0, 2).toUpperCase();

  return {
    id: row.id,
    designerId: row.designer_id,
    title: row.titulo,
    description: row.descripcion || "",
    imageUrl: row.imagen_url || "https://via.placeholder.com/300",
    rating: Number.parseFloat(row.rating) || 0,
    reviewCount: Number.parseInt(row.review_count) || 0,
    downloads: Number.parseInt(row.descargas) || 0,
    price: Number.parseFloat(row.precio_base) || 0,
    format: row.formato || "STL",
    categoria: row.categoria_nombre || undefined,
    tecnologia: row.tecnologia_nombre,
    materiales: row.materiales_nombres ?? [],
    archivoUrl: row.archivo_url || undefined,
    specs: row.especificaciones || null,
    designer: {
      name,
      initials,
      tagline: row.designer_tagline || "Diseñador 3D",
      zonaId: row.designer_zona_id ?? null,
    },
  };
}

export const productService = {
  async getAll(
    pagination: PaginationParams,
    zonaId?: number,
    categoria?: string,
  ): Promise<PaginatedResponse<Product>> {
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const zona =
      zonaId !== undefined
        ? {
            zonaId,
            provinciaPrefix: getProvinciaPrefix(zonaId),
            partidoPrefix: getPartidoPrefix(zonaId),
          }
        : undefined;

    const { rows, total } = await disenoRepository.getAllProductsPaginated(
      limit,
      offset,
      zona,
      categoria,
    );
    const products = rows.map(mapRowToProduct);

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // archivoUrl solo se incluye para el dueño (respuestas de create/update/patch).
  async getById(
    id: string,
    opts: { incluirArchivo?: boolean } = {},
  ): Promise<Product | null> {
    const row = await disenoRepository.getByIdWithDesigner(id, opts);
    if (!row) return null;
    return mapRowToProduct(row);
  },

  // URL firmada de vida corta para el preview 3D: dueño, comprador con compra pagada o
  // fabricante con orden activa pagada.
  async getArchivoPreview(id: string, userId: string): Promise<ArchivoFirmado> {
    const acceso = await disenoRepository.getAccesoArchivo(id, userId);
    if (!acceso) {
      throw new NotFoundError("Producto no encontrado");
    }
    const esDueno = acceso.disenador_id === userId && !acceso.eliminado_en;
    if (!esDueno && !acceso.es_comprador && !acceso.es_fabricante) {
      throw new ForbiddenError("No autorizado para acceder a este archivo");
    }
    return archivoService.firmarUrl(acceso.archivo_url);
  },

  async getByDesigner(designerId: string): Promise<Product[]> {
    const rows = await disenoRepository.getByDesigner(designerId);
    return rows.map(mapRowToProduct);
  },

  async create(data: CreateProductDTO, userId: string): Promise<Product> {
    await verificarUploadsPropios(userId, data);
    const { tecnologiaId, materialIds } = await resolverTecnologiaYMateriales(
      data.tecnologia,
      data.materiales,
    );

    const categoriaId = await catalogoService.resolverCategoriaId(
      data.categoria,
    );

    const newProduct = await disenoRepository.createProduct({
      disenadorId: userId,
      titulo: data.titulo,
      descripcion: data.descripcion,
      imagenUrl: data.imagenUrl,
      archivoUrl: data.archivoUrl,
      precioBase: data.precioBase,
      formato: data.formato,
      especificaciones: data.especificaciones,
      categoriaId,
      tecnologiaId,
      materialIds,
    });

    // Obtener el producto con datos del diseñador
    const product = await this.getById(newProduct.id, { incluirArchivo: true });
    return product!;
  },

  async update(
    id: string,
    data: UpdateProductDTO,
    userId: string,
  ): Promise<Product> {
    const existing = await disenoRepository.getById(id);

    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }

    if (existing.disenador_id !== userId) {
      throw new ForbiddenError("No autorizado para modificar este diseño");
    }

    // Conservar la URL ya guardada no vuelve a exigir el registro de la subida.
    await verificarUploadsPropios(userId, {
      archivoUrl:
        data.archivoUrl === existing.archivo_url ? null : data.archivoUrl,
      imagenUrl: data.imagenUrl === existing.imagen_url ? null : data.imagenUrl,
    });

    const { tecnologiaId, materialIds } = await resolverTecnologiaYMateriales(
      data.tecnologia,
      data.materiales,
    );
    const categoriaId = await catalogoService.resolverCategoriaId(
      data.categoria,
    );

    const updated = await disenoRepository.updateProduct(id, userId, {
      titulo: data.titulo,
      descripcion: data.descripcion,
      imagenUrl: data.imagenUrl,
      archivoUrl: data.archivoUrl,
      precioBase: data.precioBase,
      formato: data.formato,
      especificaciones: data.especificaciones,
      categoriaId,
      tecnologiaId,
      materialIds,
    });
    if (!updated) {
      throw new NotFoundError("Producto no encontrado");
    }

    const product = await this.getById(id, { incluirArchivo: true });
    return product!;
  },

  async partialUpdate(
    id: string,
    data: PartialUpdateProductDTO,
    userId: string,
  ): Promise<Product> {
    const existing = await disenoRepository.getById(id);

    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }

    if (existing.disenador_id !== userId) {
      throw new ForbiddenError("No autorizado para modificar este diseño");
    }

    await verificarUploadsPropios(userId, {
      archivoUrl:
        data.archivoUrl === existing.archivo_url ? null : data.archivoUrl,
      imagenUrl: data.imagenUrl === existing.imagen_url ? null : data.imagenUrl,
    });

    // Remover propiedades que no deberían ser actualizables
    const { tecnologia, materiales, categoria, ...rest } = data;
    const updates: Record<string, unknown> = { ...rest };
    delete updates.id;
    delete updates.disenadorId;

    if (categoria !== undefined) {
      updates.categoriaId =
        await catalogoService.resolverCategoriaId(categoria);
    }

    let tecnologiaId: number = existing.tecnologia_id;
    if (tecnologia !== undefined) {
      const tec = await catalogoService.resolverTecnologia(tecnologia);
      if (tec.id !== existing.tecnologia_id) {
        // Los materiales actuales pertenecen a la tecnología anterior.
        if (materiales === undefined) {
          throw new ValidationError(
            "Al cambiar la tecnología debe indicar también los materiales compatibles",
          );
        }
        updates.tecnologiaId = tec.id;
      }
      tecnologiaId = tec.id;
    }

    const materialIds =
      materiales === undefined
        ? undefined
        : (
            await catalogoService.resolverMateriales(materiales, tecnologiaId)
          ).map((m) => m.id);

    const updated = await disenoRepository.partialUpdateProduct(
      id,
      userId,
      updates,
      materialIds,
    );

    if (!updated) {
      throw new NotFoundError("Producto no encontrado o sin cambios válidos");
    }

    const product = await this.getById(id, { incluirArchivo: true });
    return product!;
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await disenoRepository.getById(id);

    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }

    if (existing.disenador_id !== userId) {
      throw new ForbiddenError("No autorizado para eliminar este diseño");
    }

    const deleted = await disenoRepository.deleteProduct(id, userId);

    if (!deleted) {
      throw new NotFoundError("Producto no encontrado");
    }
  },
};
