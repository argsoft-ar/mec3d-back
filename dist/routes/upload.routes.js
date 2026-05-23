"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_controller_1 = require("../controllers/upload.controller");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Subir una imagen (protegido por auth).
// Multer interceptará el campo 'imagen' del form-data.
router.post('/imagen', auth_middleware_1.authenticateToken, upload_middleware_1.uploadImageMiddleware.single('imagen'), upload_controller_1.uploadImage);
exports.default = router;
