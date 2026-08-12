export interface ProductSpecificaciones {
  material: string;
  dimensiones: string;
  dificultad: string;
  tiempoImpresion: string;
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
  especificaciones?: ProductSpecificaciones;
}

export interface UpdateProductDTO extends CreateProductDTO {}
export type PartialUpdateProductDTO = Partial<CreateProductDTO>;
