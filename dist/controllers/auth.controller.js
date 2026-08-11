"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = exports.registerUser = void 0;
const auth_service_1 = require("../services/auth.service");
const registerUser = async (req, res, next) => {
    try {
        const result = await auth_service_1.authService.register(req.body);
        res.status(201).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.registerUser = registerUser;
const loginUser = async (req, res, next) => {
    try {
        const result = await auth_service_1.authService.login(req.body);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.loginUser = loginUser;
