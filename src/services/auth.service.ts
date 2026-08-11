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

const SALT_ROUNDS = 10;

export const authService = {
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const { email, password, rolPrincipal, zonaId, georefLocalidadId } = data;
    const normalizedEmail = email.trim().toLowerCase();

    // Verificar si el usuario ya existe
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError("El email ya está registrado");
    }

    // Encriptar la contraseña usando bcrypt
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Guardar en la base de datos
    const newUser = await userRepository.createUser({
      email: normalizedEmail,
      passwordHash,
      rolPrincipal,
      zonaId,
      georefLocalidadId,
    });

    // Mapear respuesta de BD (snake_case) a camelCase
    return {
      message: "Usuario registrado exitosamente",
      user: {
        id: newUser.id,
        email: newUser.email,
        rolPrincipal: newUser.rol_principal,
        zonaId: newUser.zona_id,
        creadoEn: newUser.creado_en,
      },
    };
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
