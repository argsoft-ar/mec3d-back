"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_config_1 = require("../config/env.config");
// Validar al importar - la app NO debe arrancar sin secret
const JWT_SECRET = env_config_1.envConfig.jwt.secret;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET no está configurado. La aplicación no puede iniciar de forma segura.');
}
const JWT_EXPIRES_IN = env_config_1.envConfig.jwt.expiresIn || '1d';
const generateToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
exports.generateToken = generateToken;
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch (error) {
        return null;
    }
};
exports.verifyToken = verifyToken;
