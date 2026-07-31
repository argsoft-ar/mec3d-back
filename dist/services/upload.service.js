"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadService = void 0;
const cloudinary_config_1 = __importDefault(require("../config/cloudinary.config"));
const app_error_1 = require("../errors/app-error");
exports.uploadService = {
    async uploadImage(buffer, filename) {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary_config_1.default.uploader.upload_stream({
                folder: 'mec3d/portadas',
                format: 'webp',
                transformation: [
                    { width: 800, height: 600, crop: 'limit' },
                ],
            }, (error, result) => {
                if (error) {
                    console.error('❌ Error de Cloudinary:', error);
                    reject(new app_error_1.AppError('Error al subir la imagen a la nube', 500));
                    return;
                }
                if (!result?.secure_url) {
                    reject(new app_error_1.AppError('No se obtuvo URL de la imagen', 500));
                    return;
                }
                resolve(result.secure_url);
            });
            uploadStream.end(buffer);
        });
    },
};
