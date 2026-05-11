import { Request, Response } from 'express';
import { disenoRepository } from '../repositories/diseno.repository';

// Interface mapeada exactamente como espera el Frontend
export interface ProductSpec {
  icon?: any; // Icon lo maneja el frontend visualmente
  title: string;
  value: string;
}

export interface ProductDesigner {
  initials: string;
  name: string;
  tagline: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  downloads: number;
  price: number;
  format: string;
  specs: ProductSpec[];
  designer: ProductDesigner;
}

export const getAllProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawProducts = await disenoRepository.getAllProducts();

    // Mapeo crudo de BD a la interfaz "Product"
    const formattedProducts: Product[] = rawProducts.map((row: any) => {
      // Generar initiales del nombre: e.g. "juan" -> "JU"
      const name = row.designer_name || 'Anónimo';
      const initials = name.substring(0, 2).toUpperCase();

      return {
        id: row.id,
        title: row.titulo,
        description: row.descripcion || '',
        imageUrl: row.imagen_url || 'https://via.placeholder.com/300',
        rating: parseFloat(row.rating) || 0,
        reviewCount: parseInt(row.review_count) || 0,
        downloads: parseInt(row.descargas) || 0,
        price: parseFloat(row.precio_base) || 0,
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
  } catch (error: any) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({ error: 'Error al obtener los productos' });
  }
};

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    // Si viene del middleware de Auth, usamos req.user!.id
    const disenadorId = req.user?.id; 
    
    // De momento si no hay auth middleware inyectado en esta ruta, usamos uno del body o mock
    // if (!disenadorId) return res.status(401).json({ error: "No autorizado" });
    const { 
        titulo, descripcion, imagenUrl, archivoUrl, 
        precioBase, formato, especificaciones 
    } = req.body;

    const newProduct = await disenoRepository.createProduct({
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
  } catch (error: any) {
    console.error('❌ Error creando producto:', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
        titulo, descripcion, imagenUrl, archivoUrl, 
        precioBase, formato, especificaciones 
    } = req.body;

    const updated = await disenoRepository.updateProduct(id, {
        titulo, descripcion, imagenUrl, archivoUrl, 
        precioBase, formato, especificaciones
    });

    if (!updated) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.status(200).json({ message: 'Producto actualizado exitosamente', data: updated });
  } catch (error) {
    console.error('❌ Error actualizando producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
};

export const partialUpdateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remover propiedades que no deberían ser actualizables por el usuario (seguridad extra)
    delete updates.id;
    delete updates.disenadorId;

    const updated = await disenoRepository.partialUpdateProduct(id, updates);

    if (!updated) {
      res.status(404).json({ error: 'Producto no encontrado o sin cambios válidos' });
      return;
    }

    res.status(200).json({ message: 'Producto modificado exitosamente', data: updated });
  } catch (error) {
    console.error('❌ Error modificando producto:', error);
    res.status(500).json({ error: 'Error al modificar producto' });
  }
};

export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await disenoRepository.deleteProduct(id);

    if (!deleted) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.status(200).json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('❌ Error eliminando producto:', error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
};
