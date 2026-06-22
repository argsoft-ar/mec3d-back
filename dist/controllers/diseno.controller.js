"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.partialUpdateProduct = exports.updateProduct = exports.createProduct = exports.getAllProducts = void 0;
const diseno_repository_1 = require("../repositories/diseno.repository");
const getAllProducts = async (req, res) => {
    try {
        const rawProducts = await diseno_repository_1.disenoRepository.getAllProducts();
        // Mapeo crudo de BD a la interfaz "Product"
        const formattedProducts = rawProducts.map((row) => {
            // Generar initiales del nombre: e.g. "juan" -> "JU"
            const name = row.designer_name || 'Anónimo';
            const initials = name.substring(0, 2).toUpperCase();
            return {
                id: row.id,
                title: row.titulo,
                description: row.descripcion || '',
                imageUrl: row.imagen_url || 'https://via.placeholder.com/300',
                rating: Number.parseFloat(row.rating) || 0,
                reviewCount: Number.parseInt(row.review_count) || 0,
                downloads: Number.parseInt(row.descargas) || 0,
                price: Number.parseFloat(row.precio_base) || 0,
                format: row.formato || 'STL',
                specs: row.especificaciones || [],
                designer: {
                    name: name,
                    initials: initials,
                    tagline: row.designer_tagline || 'Diseñador 3D'
                }
            };
        });
        res.status(200).json(formattedProducts);
    }
    catch (error) {
        console.error('❌ Error obteniendo productos:', error);
        res.status(500).json({ error: 'Error al obtener los productos' });
    }
};
exports.getAllProducts = getAllProducts;
const createProduct = async (req, res) => {
    try {
        // Si viene del middleware de Auth, usamos req.user!.id
        const disenadorId = req.user?.id;
        // De momento si no hay auth middleware inyectado en esta ruta, usamos uno del body o mock
        // if (!disenadorId) return res.status(401).json({ error: "No autorizado" });
        const { titulo, descripcion, imagenUrl, archivoUrl, precioBase, formato, especificaciones } = req.body;
        const newProduct = await diseno_repository_1.disenoRepository.createProduct({
            disenadorId: disenadorId || req.body.disenadorId, // fallback por si probamos sin token
            titulo,
            descripcion,
            imagenUrl,
            archivoUrl,
            precioBase,
            formato,
            especificaciones
        });
        res.status(201).json({
            message: 'Producto creado exitosamente',
            data: newProduct
        });
    }
    catch (error) {
        console.error('❌ Error creando producto:', error);
        res.status(500).json({ error: 'Error al crear producto' });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, descripcion, imagenUrl, archivoUrl, precioBase, formato, especificaciones } = req.body;
        const updated = await diseno_repository_1.disenoRepository.updateProduct(id, {
            titulo, descripcion, imagenUrl, archivoUrl,
            precioBase, formato, especificaciones
        });
        if (!updated) {
            res.status(404).json({ error: 'Producto no encontrado' });
            return;
        }
        res.status(200).json({ message: 'Producto actualizado exitosamente', data: updated });
    }
    catch (error) {
        console.error('❌ Error actualizando producto:', error);
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
};
exports.updateProduct = updateProduct;
const partialUpdateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Remover propiedades que no deberían ser actualizables por el usuario (seguridad extra)
        delete updates.id;
        delete updates.disenadorId;
        const updated = await diseno_repository_1.disenoRepository.partialUpdateProduct(id, updates);
        if (!updated) {
            res.status(404).json({ error: 'Producto no encontrado o sin cambios válidos' });
            return;
        }
        res.status(200).json({ message: 'Producto modificado exitosamente', data: updated });
    }
    catch (error) {
        console.error('❌ Error modificando producto:', error);
        res.status(500).json({ error: 'Error al modificar producto' });
    }
};
exports.partialUpdateProduct = partialUpdateProduct;
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await diseno_repository_1.disenoRepository.deleteProduct(id);
        if (!deleted) {
            res.status(404).json({ error: 'Producto no encontrado' });
            return;
        }
        res.status(200).json({ message: 'Producto eliminado exitosamente' });
    }
    catch (error) {
        console.error('❌ Error eliminando producto:', error);
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
};
exports.deleteProduct = deleteProduct;
