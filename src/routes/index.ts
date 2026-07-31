import { Router, Request, Response } from "express";
import { healthCheck } from "../controllers/health.controller";
import authRoutes from "./auth.routes";
import disenoRoutes from "./diseno.routes";
import uploadRoutes from "./upload.routes";
import georefRoutes from "./georef.routes";

const router = Router();

// Endpoint de prueba centralizado
router.get("/health", healthCheck);

// Rutas de autenticación
router.use("/auth", authRoutes);

// Rutas del catálogo de productos (Diseños 3D)
router.use("/productos", disenoRoutes);

// Rutas de subida de archivos (Imágenes, STL, etc)
router.use("/archivos", uploadRoutes);

// Rutas de datos geográficos (API Georef de Argentina)
router.use("/georef", georefRoutes);

export default router;
