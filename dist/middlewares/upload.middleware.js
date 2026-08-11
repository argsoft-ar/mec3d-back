"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImageMiddleware = exports.validateImageSignature = void 0;
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage();
// Magic numbers para tipos de imagen válidos
const IMAGE_SIGNATURES = {
    'ffd8ff': 'image/jpeg', // JPEG
    '89504e47': 'image/png', // PNG  
    '47494638': 'image/gif', // GIF
    '52494646': 'image/webp', // WebP (RIFF header)
};
// Validar magic number del buffer
const validateImageSignature = (buffer) => {
    const header = buffer.subarray(0, 4).toString('hex').toLowerCase();
    return Object.keys(IMAGE_SIGNATURES).some(sig => header.startsWith(sig));
};
exports.validateImageSignature = validateImageSignature;
// Filtro básico por mimetype (primera capa)
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WebP)'));
    }
};
exports.uploadImageMiddleware = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
    fileFilter
});
