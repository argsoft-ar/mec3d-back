"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = void 0;
const db_config_1 = __importDefault(require("../config/db.config"));
exports.userRepository = {
    async findByEmail(email) {
        const query = `
      SELECT id, email, password_hash, rol_principal, zona_id, puntuacion, cuenta_mercadopago, creado_en, actualizado_en
      FROM usuarios
      WHERE email = $1;
    `;
        const result = await db_config_1.default.query(query, [email]);
        return result.rows[0] || null;
    },
    async createUser(userData) {
        const query = `
      INSERT INTO usuarios (email, password_hash, rol_principal, zona_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, rol_principal, zona_id, creado_en;
    `;
        const values = [
            userData.email,
            userData.passwordHash,
            userData.rolPrincipal,
            userData.zonaId || null,
        ];
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    }
};
