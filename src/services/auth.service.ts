import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository";
import { generateSocketToken, generateToken } from "../utils/jwt.util";
import {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  SessionResult,
  SocketTokenResponse,
  TokenPayload,
} from "../interfaces/auth.interface";
import { RolUsuario, UserResponse } from "../interfaces/user.interface";
import { ConflictError, UnauthorizedError } from "../errors/app-error";
import { isReservedUsername } from "../utils/username.util";
import { SALT_ROUNDS } from "../utils/password.util";

const USERNAME_TAKEN_MESSAGE = "El nombre de usuario no está disponible";
const EMAIL_TAKEN_MESSAGE = "El email ya está registrado";

// Mapea la violación UNIQUE (carrera entre el chequeo y el INSERT) sin exponer detalles de BD.
function mapUniqueViolation(error: unknown): ConflictError | null {
  const { code, constraint } = (error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  if (code !== "23505") return null;
  if (constraint?.includes("username")) {
    return new ConflictError(USERNAME_TAKEN_MESSAGE);
  }
  if (constraint?.includes("email")) {
    return new ConflictError(EMAIL_TAKEN_MESSAGE);
  }
  return null;
}

interface UsuarioSesionRow {
  id: string;
  email: string;
  rol_principal: RolUsuario;
  zona_id: number | null;
  cuenta_mercadopago: string | null;
}

// Mismo shape de `user` que devuelve el login (y /auth/me).
function mapUsuarioSesion(row: UsuarioSesionRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
    rolPrincipal: row.rol_principal,
    zonaId: row.zona_id,
    cuentaMercadopago: row.cuenta_mercadopago,
  };
}

export const authService = {
  /** Firma un JWT de sesión (para la cookie) con los claims mínimos. */
  createSessionToken(payload: TokenPayload): string {
    return generateToken(payload);
  },

  /** JWT efímero (~60 s, aud "socket") para el handshake de socket.io. */
  createSocketToken(payload: TokenPayload): SocketTokenResponse {
    return { token: generateSocketToken(payload) };
  },

  async me(userId: string): Promise<MeResponse> {
    const user = (await userRepository.findById(
      userId,
    )) as UsuarioSesionRow | null;
    // Cuenta eliminada con una cookie todavía vigente: se trata como sesión inválida.
    if (!user) {
      throw new UnauthorizedError("Sesión inválida");
    }
    return { user: mapUsuarioSesion(user) };
  },

  async register(
    data: RegisterRequest,
  ): Promise<SessionResult<RegisterResponse>> {
    const {
      email,
      username,
      password,
      rolPrincipal,
      zonaId,
      georefLocalidadId,
    } = data;
    const normalizedEmail = email.trim().toLowerCase();

    // Verificar si el usuario ya existe
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError(EMAIL_TAKEN_MESSAGE);
    }

    if (await userRepository.isUsernameTaken(username)) {
      throw new ConflictError(USERNAME_TAKEN_MESSAGE);
    }

    // Encriptar la contraseña usando bcrypt
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Guardar en la base de datos
    let newUser;
    try {
      newUser = await userRepository.createUser({
        email: normalizedEmail,
        username,
        passwordHash,
        rolPrincipal,
        zonaId,
        georefLocalidadId,
      });
    } catch (error) {
      throw mapUniqueViolation(error) ?? error;
    }

    // Mapear respuesta de BD (snake_case) a camelCase. El registro deja la sesión abierta.
    return {
      sessionToken: generateToken({
        id: newUser.id,
        email: newUser.email,
        rolPrincipal: newUser.rol_principal,
      }),
      body: {
        message: "Usuario registrado exitosamente",
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          rolPrincipal: newUser.rol_principal,
          zonaId: newUser.zona_id,
          creadoEn: newUser.creado_en,
        },
      },
    };
  },

  async checkUsernameDisponible(
    username: string,
  ): Promise<{ disponible: boolean }> {
    if (isReservedUsername(username)) return { disponible: false };
    const taken = await userRepository.isUsernameTaken(username);
    return { disponible: !taken };
  },

  async login(data: LoginRequest): Promise<SessionResult<LoginResponse>> {
    const { email, password } = data;
    const normalizedEmail = email.trim().toLowerCase();

    // Buscar usuario por email
    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    // Comparar contraseñas
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    // Generar el JWT de sesión (viaja solo en la cookie HttpOnly, nunca en el body)
    const sessionToken = generateToken({
      id: user.id,
      email: user.email,
      rolPrincipal: user.rol_principal,
    });

    // Datos básicos del usuario (nunca el password_hash)
    return {
      sessionToken,
      body: {
        message: "Login exitoso",
        user: mapUsuarioSesion(user),
      },
    };
  },
};
