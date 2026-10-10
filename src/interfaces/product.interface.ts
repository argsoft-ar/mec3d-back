export interface ProductSpecificaciones {
  dimensiones: string;
  dificultad: string;
  // Horas enteras (1-500): impresión 3D o fabricación CNC.
  tiempoImpresion: number;
  soportes: string;
  configuracion: {
    layer: string;
    infill: string;
  };
}

export interface ProductDesigner {
  initials: string;
  name: string;
  tagline: string;
  zonaId: number | null;
}

export interface Product {
  id: string;
  designerId: string;
  title: string;
  description: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  downloads: number;
  price: number;
  format: string;
  categoria?: string;
  tecnologia: string;
  materiales: string[];
  archivoUrl?: string;
  specs: ProductSpecificaciones | null;
  designer: ProductDesigner;
}

export interface CreateProductDTO {
  disenadorId?: string;
  titulo: string;
  descripcion?: string;
  imagenUrl?: string;
  archivoUrl: string;
  precioBase: number;
  formato?: string;
  categoria?: string;
  tecnologia: string;
  materiales: string[];
  especificaciones?: ProductSpecificaciones;
}

export type UpdateProductDTO = CreateProductDTO;
export type PartialUpdateProductDTO = Partial<CreateProductDTO>;
