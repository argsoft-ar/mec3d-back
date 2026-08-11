// Entidades geográficas devueltas por la API Georef de Argentina
export interface Provincia {
  id: string;
  nombre: string;
}

export interface Departamento {
  id: string;
  nombre: string;
  provincia?: Provincia;
}

export interface Localidad {
  id: string;
  nombre: string;
  departamento?: Departamento | null;
  provincia?: Provincia;
}

// Metadatos de paginación comunes a todas las respuestas de Georef
interface GeorefBaseResponse {
  cantidad: number;
  total: number;
  inicio: number;
}

export interface GeorefProvinciasResponse extends GeorefBaseResponse {
  provincias: Provincia[];
}

export interface GeorefDepartamentosResponse extends GeorefBaseResponse {
  departamentos: Departamento[];
}

export interface GeorefLocalidadesResponse extends GeorefBaseResponse {
  localidades: Localidad[];
}
