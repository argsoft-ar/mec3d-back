"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const auth_schema_1 = require("../schemas/auth.schema");
const router = (0, express_1.Router)();
// Endpoint de registro
router.post('/registro', (0, validate_middleware_1.validateSchema)(auth_schema_1.registerSchema), auth_controller_1.registerUser);
// Endpoint de login
router.post('/login', (0, validate_middleware_1.validateSchema)(auth_schema_1.loginSchema), auth_controller_1.loginUser);
exports.default = router;
