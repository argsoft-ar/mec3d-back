import { RolUsuario, UserResponse } from "./user.interface";

export interface TokenPayload {
  id: string;
  email: string;
  rolPrincipal: RolUsuario;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: UserResponse;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  rolPrincipal: RolUsuario;
  zonaId?: number;
  georefLocalidadId?: string;
}

export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    username: string;
    rolPrincipal: RolUsuario;
    zonaId: number | null;
    creadoEn: string;
  };
}
