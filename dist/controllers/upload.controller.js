"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = void 0;
const cloudinary_config_1 = __importDefault(require("../config/cloudinary.config"));
const uploadImage = async (req, res) => {
    try {
        // Verificar que el archivo venga en la request (gracias a Multer)
        if (!req.file) {
            res.status(400).json({ error: 'No se ha enviado ninguna imagen' });
            return;
        }
        // Subir desde el buffer de memoria a Cloudinary
        const uploadStream = cloudinary_config_1.default.uploader.upload_stream({
            folder: 'mec3d/portadas', // Carpeta en tu Cloudinary
            format: 'webp', // Convertir a webp para optimización
            transformation: [
                { width: 800, height: 600, crop: 'limit' } // Redimensionar si es muy grande
            ]
        }, (error, result) => {
            if (error) {
                console.error('❌ Error de Cloudinary:', error);
                res.status(500).json({ error: 'Error al subir la imagen a la nube' });
                return;
            }
            // Éxito: Devolvemos la URL segura
            res.status(200).json({
                message: 'Imagen subida exitosamente',
                url: result?.secure_url
            });
        });
        // Escribir el buffer en el stream de subida
        uploadStream.end(req.file.buffer);
    }
    catch (error) {
        console.error('❌ Error en el controlador de subida:', error);
        res.status(500).json({ error: 'Error interno al procesar la imagen' });
    }
};
exports.uploadImage = uploadImage;
