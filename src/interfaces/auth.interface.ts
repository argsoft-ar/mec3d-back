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
  user: UserResponse;
}

// Resultado interno de las operaciones que abren sesión: el token nunca va en el body,
// el controller lo escribe en la cookie HttpOnly.
export interface SessionResult<T> {
  body: T;
  sessionToken: string;
}

export interface MeResponse {
  user: UserResponse;
}

export interface SocketTokenResponse {
  token: string;
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
