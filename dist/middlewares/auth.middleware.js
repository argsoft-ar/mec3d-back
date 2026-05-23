"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jwt_util_1 = require("../utils/jwt.util");
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // El header usualmente tiene el formato: "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
        return;
    }
    const payload = (0, jwt_util_1.verifyToken)(token);
    if (!payload) {
        res.status(403).json({ error: 'Token inválido o expirado.' });
        return;
    }
    // Inyectar los datos del usuario en la request para su uso en los controladores
    req.user = payload;
    next();
};
exports.authenticateToken = authenticateToken;
