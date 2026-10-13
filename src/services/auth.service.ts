import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository";
import { generateToken } from "../utils/jwt.util";
import {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
} from "../interfaces/auth.interface";
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

export const authService = {
  async register(data: RegisterRequest): Promise<RegisterResponse> {
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

    // Mapear respuesta de BD (snake_case) a camelCase
    return {
      message: "Usuario registrado exitosamente",
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        rolPrincipal: newUser.rol_principal,
        zonaId: newUser.zona_id,
        creadoEn: newUser.creado_en,
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

  async login(data: LoginRequest): Promise<LoginResponse> {
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

    // Generar el JWT con camelCase
    const token = generateToken({
      id: user.id,
      email: user.email,
      rolPrincipal: user.rol_principal,
    });

    // Devolver token y datos básicos del usuario (nunca el password_hash)
    return {
      message: "Login exitoso",
      token,
      user: {
        id: user.id,
        email: user.email,
        rolPrincipal: user.rol_principal,
        zonaId: user.zona_id,
        cuentaMercadopago: user.cuenta_mercadopago,
      },
    };
  },
};
