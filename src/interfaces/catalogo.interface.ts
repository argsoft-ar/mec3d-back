export interface TecnologiaCatalogo {
  id: number;
  nombre: string;
}

export interface MaterialCatalogo {
  id: number;
  nombre: string;
  tecnologiaId: number;
}
