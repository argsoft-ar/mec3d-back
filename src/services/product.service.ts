import { disenoRepository } from "../repositories/diseno.repository";
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
import { NotFoundError, ForbiddenError } from "../errors/app-error";
import { getProvinciaPrefix, getPartidoPrefix } from "../utils/zona.util";

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

  async getById(id: string): Promise<Product | null> {
    const row = await disenoRepository.getByIdWithDesigner(id);
    if (!row) return null;
    return mapRowToProduct(row);
  },

  async getByDesigner(designerId: string): Promise<Product[]> {
    const rows = await disenoRepository.getByDesigner(designerId);
    return rows.map(mapRowToProduct);
  },

  async create(data: CreateProductDTO, userId: string): Promise<Product> {
    const newProduct = await disenoRepository.createProduct({
      disenadorId: userId,
      titulo: data.titulo,
      descripcion: data.descripcion,
      imagenUrl: data.imagenUrl,
      archivoUrl: data.archivoUrl,
      precioBase: data.precioBase,
      formato: data.formato,
      especificaciones: data.especificaciones,
      categoria: data.categoria,
    });

    // Obtener el producto con datos del diseñador
    const product = await this.getById(newProduct.id);
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

    await disenoRepository.updateProduct(id, {
      titulo: data.titulo,
      descripcion: data.descripcion,
      imagenUrl: data.imagenUrl,
      archivoUrl: data.archivoUrl,
      precioBase: data.precioBase,
      formato: data.formato,
      especificaciones: data.especificaciones,
      categoria: data.categoria,
    });

    const product = await this.getById(id);
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

    // Remover propiedades que no deberían ser actualizables
    const updates = { ...data };
    delete (updates as any).id;
    delete updates.disenadorId;

    const updated = await disenoRepository.partialUpdateProduct(id, updates);

    if (!updated) {
      throw new NotFoundError("Producto no encontrado o sin cambios válidos");
    }

    const product = await this.getById(id);
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

    const deleted = await disenoRepository.deleteProduct(id);

    if (!deleted) {
      throw new NotFoundError("Producto no encontrado");
    }
  },
};
