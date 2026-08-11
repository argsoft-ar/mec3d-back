"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diseno_controller_1 = require("../controllers/diseno.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const schemas_1 = require("../schemas");
const router = (0, express_1.Router)();
// Obtener mis productos (protegido por auth)
router.get("/mis-disenos", auth_middleware_1.authenticateToken, diseno_controller_1.getMyProducts);
// Obtener todos los productos (público) - con paginación
router.get("/", (0, validate_middleware_1.validateSchema)(schemas_1.paginationSchema), diseno_controller_1.getAllProducts);
// Crear un producto (protegido por auth + Zod)
router.post("/", auth_middleware_1.authenticateToken, (0, validate_middleware_1.validateSchema)(schemas_1.createProductSchema), diseno_controller_1.createProduct);
// Actualizar un producto completo (protegido por auth + Zod + UUID)
router.put("/:id", auth_middleware_1.authenticateToken, (0, validate_middleware_1.validateSchema)(schemas_1.uuidParamSchema), (0, validate_middleware_1.validateSchema)(schemas_1.updateProductSchema), diseno_controller_1.updateProduct);
// Actualización parcial de un producto (protegido por auth + Zod + UUID)
router.patch("/:id", auth_middleware_1.authenticateToken, (0, validate_middleware_1.validateSchema)(schemas_1.uuidParamSchema), (0, validate_middleware_1.validateSchema)(schemas_1.partialUpdateProductSchema), diseno_controller_1.partialUpdateProduct);
// Eliminar un producto (protegido por auth + UUID)
router.delete("/:id", auth_middleware_1.authenticateToken, (0, validate_middleware_1.validateSchema)(schemas_1.uuidParamSchema), diseno_controller_1.deleteProduct);
exports.default = router;
