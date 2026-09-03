export type RolUsuario = "comprador" | "disenador" | "fabricante" | "admin";

export interface User {
  id: string;
  email: string;
  rolPrincipal: RolUsuario;
  zonaId: number | null;
  puntuacion: number;
  cuentaMercadopago: string | null;
  tagline: string | null;
  descripcion: string | null;
  experiencia: string | null;
  username: string | null;
  telefono: string | null;
  direccion: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  rolPrincipal: RolUsuario;
  zonaId?: number;
}

export interface UserResponse {
  id: string;
  email: string;
  rolPrincipal: RolUsuario;
  zonaId: number | null;
  cuentaMercadopago: string | null;
}

export interface Material {
  id: number;
  material: string;
  disponible: boolean;
}

export interface Tecnologia {
  id: number;
  tecnologia: string;
  disponible: boolean;
}

export interface UpdateProfileDTO {
  tagline?: string;
  descripcion?: string;
  experiencia?: string;
  zonaId?: number;
  cuentaMercadopago?: string;
  georefLocalidadId?: string;
  username?: string;
  telefono?: string;
  direccion?: string;
}

export interface FabricantePublico {
  id: string;
  email: string;
  zonaId: number | null;
  puntuacion: number;
  tagline: string | null;
  descripcion: string | null;
  experiencia: string | null;
  materiales: Material[];
  tecnologias: Tecnologia[];
}
