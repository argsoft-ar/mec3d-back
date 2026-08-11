"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = void 0;
const upload_service_1 = require("../services/upload.service");
const app_error_1 = require("../errors/app-error");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const uploadImage = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new app_error_1.ValidationError('No se ha enviado ninguna imagen');
        }
        // Validar magic number del archivo (segunda capa de seguridad)
        if (!(0, upload_middleware_1.validateImageSignature)(req.file.buffer)) {
            throw new app_error_1.ValidationError('El archivo no es una imagen válida');
        }
        const url = await upload_service_1.uploadService.uploadImage(req.file.buffer, req.file.originalname);
        res.status(200).json({
            message: 'Imagen subida exitosamente',
            url,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.uploadImage = uploadImage;
