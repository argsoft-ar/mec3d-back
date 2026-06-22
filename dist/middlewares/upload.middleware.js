"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImageMiddleware = void 0;
const multer_1 = __importDefault(require("multer"));
// Usamos memoryStorage para no guardar el archivo físico en el servidor.
// El archivo quedará temporalmente en la memoria RAM (buffer) 
// para poder enviarlo directamente a Cloudinary o AWS.
const storage = multer_1.default.memoryStorage();
// Filtro opcional: solo aceptar imágenes por ahora
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    }
    else {
        cb(new Error('Solo se permiten archivos de imagen'));
    }
};
exports.uploadImageMiddleware = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // Límite de 5 MB
    },
    fileFilter
});
