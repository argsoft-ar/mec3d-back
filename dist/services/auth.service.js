"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_repository_1 = require("../repositories/user.repository");
const jwt_util_1 = require("../utils/jwt.util");
const app_error_1 = require("../errors/app-error");
const SALT_ROUNDS = 10;
exports.authService = {
    async register(data) {
        const { email, password, rolPrincipal, zonaId } = data;
        // Verificar si el usuario ya existe
        const existingUser = await user_repository_1.userRepository.findByEmail(email);
        if (existingUser) {
            throw new app_error_1.ConflictError('El email ya está registrado');
        }
        // Encriptar la contraseña usando bcrypt
        const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
        // Guardar en la base de datos
        const newUser = await user_repository_1.userRepository.createUser({
            email,
            passwordHash,
            rolPrincipal,
            zonaId,
        });
        // Mapear respuesta de BD (snake_case) a camelCase
        return {
            message: 'Usuario registrado exitosamente',
            user: {
                id: newUser.id,
                email: newUser.email,
                rolPrincipal: newUser.rol_principal,
                zonaId: newUser.zona_id,
                creadoEn: newUser.creado_en,
            },
        };
    },
    async login(data) {
        const { email, password } = data;
        // Buscar usuario por email
        const user = await user_repository_1.userRepository.findByEmail(email);
        if (!user) {
            throw new app_error_1.UnauthorizedError('Credenciales inválidas');
        }
        // Comparar contraseñas
        const isValidPassword = await bcrypt_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new app_error_1.UnauthorizedError('Credenciales inválidas');
        }
        // Generar el JWT con camelCase
        const token = (0, jwt_util_1.generateToken)({
            id: user.id,
            email: user.email,
            rolPrincipal: user.rol_principal,
        });
        // Devolver token y datos básicos del usuario (nunca el password_hash)
        return {
            message: 'Login exitoso',
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
