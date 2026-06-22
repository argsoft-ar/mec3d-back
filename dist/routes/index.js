"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const health_controller_1 = require("../controllers/health.controller");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const diseno_routes_1 = __importDefault(require("./diseno.routes"));
const upload_routes_1 = __importDefault(require("./upload.routes"));
const router = (0, express_1.Router)();
// Endpoint de prueba centralizado
router.get('/health', health_controller_1.healthCheck);
// Rutas de autenticación
router.use('/auth', auth_routes_1.default);
// Rutas del catálogo de productos (Diseños 3D)
router.use('/productos', diseno_routes_1.default);
// Rutas de subida de archivos (Imágenes, STL, etc)
router.use('/archivos', upload_routes_1.default);
exports.default = router;
