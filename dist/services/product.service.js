"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = void 0;
const diseno_repository_1 = require("../repositories/diseno.repository");
const app_error_1 = require("../errors/app-error");
/**
 * Mapea una fila de la BD (snake_case) a la interfaz Product (camelCase)
 */
function mapRowToProduct(row) {
    const name = row.designer_name || 'Anónimo';
    const initials = name.substring(0, 2).toUpperCase();
    return {
        id: row.id,
        designerId: row.designer_id,
        title: row.titulo,
        description: row.descripcion || '',
        imageUrl: row.imagen_url || 'https://via.placeholder.com/300',
        rating: Number.parseFloat(row.rating) || 0,
        reviewCount: Number.parseInt(row.review_count) || 0,
        downloads: Number.parseInt(row.descargas) || 0,
        price: Number.parseFloat(row.precio_base) || 0,
        format: row.formato || 'STL',
        categoria: row.categoria_nombre || undefined,
        specs: row.especificaciones || null,
        designer: {
            name,
            initials,
            tagline: row.designer_tagline || 'Diseñador 3D',
        },
    };
}
exports.productService = {
    async getAll(pagination) {
        const { page, limit } = pagination;
        const offset = (page - 1) * limit;
        const { rows, total } = await diseno_repository_1.disenoRepository.getAllProductsPaginated(limit, offset);
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
    async getById(id) {
        const row = await diseno_repository_1.disenoRepository.getByIdWithDesigner(id);
        if (!row)
            return null;
        return mapRowToProduct(row);
    },
    async getByDesigner(designerId) {
        const rows = await diseno_repository_1.disenoRepository.getByDesigner(designerId);
        return rows.map(mapRowToProduct);
    },
    async create(data, userId) {
        const newProduct = await diseno_repository_1.disenoRepository.createProduct({
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
        return product;
    },
    async update(id, data, userId) {
        const existing = await diseno_repository_1.disenoRepository.getById(id);
        if (!existing) {
            throw new app_error_1.NotFoundError('Producto no encontrado');
        }
        if (existing.disenador_id !== userId) {
            throw new app_error_1.ForbiddenError('No autorizado para modificar este diseño');
        }
        await diseno_repository_1.disenoRepository.updateProduct(id, {
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
        return product;
    },
    async partialUpdate(id, data, userId) {
        const existing = await diseno_repository_1.disenoRepository.getById(id);
        if (!existing) {
            throw new app_error_1.NotFoundError('Producto no encontrado');
        }
        if (existing.disenador_id !== userId) {
            throw new app_error_1.ForbiddenError('No autorizado para modificar este diseño');
        }
        // Remover propiedades que no deberían ser actualizables
        const updates = { ...data };
        delete updates.id;
        delete updates.disenadorId;
        const updated = await diseno_repository_1.disenoRepository.partialUpdateProduct(id, updates);
        if (!updated) {
            throw new app_error_1.NotFoundError('Producto no encontrado o sin cambios válidos');
        }
        const product = await this.getById(id);
        return product;
    },
    async delete(id, userId) {
        const existing = await diseno_repository_1.disenoRepository.getById(id);
        if (!existing) {
            throw new app_error_1.NotFoundError('Producto no encontrado');
        }
        if (existing.disenador_id !== userId) {
            throw new app_error_1.ForbiddenError('No autorizado para eliminar este diseño');
        }
        const deleted = await diseno_repository_1.disenoRepository.deleteProduct(id);
        if (!deleted) {
            throw new app_error_1.NotFoundError('Producto no encontrado');
        }
    },
};
