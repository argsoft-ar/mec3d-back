export type RolUsuario = "comprador" | "disenador" | "fabricante" | "admin";

export interface User {
  id: string;
  email: string;
  rolPrincipal: RolUsuario;
  zonaId: number | null;
  puntuacion: number;
  cuentaMercadopago: string | null;
  tagline: string | null;
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

export interface UpdateProfileDTO {
  tagline?: string;
  descripcion?: string;
  experiencia?: string;
  zonaId?: number;
  cuentaMercadopago?: string;
  georefLocalidadId?: string;
}
