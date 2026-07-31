"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const rate_limit_middleware_1 = require("../middlewares/rate-limit.middleware");
const auth_schema_1 = require("../schemas/auth.schema");
const router = (0, express_1.Router)();
// Endpoint de registro con rate limiting
router.post('/registro', rate_limit_middleware_1.authLimiter, (0, validate_middleware_1.validateSchema)(auth_schema_1.registerSchema), auth_controller_1.registerUser);
// Endpoint de login con rate limiting
router.post('/login', rate_limit_middleware_1.authLimiter, (0, validate_middleware_1.validateSchema)(auth_schema_1.loginSchema), auth_controller_1.loginUser);
exports.default = router;
