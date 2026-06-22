"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloudinary_1 = require("cloudinary");
const env_config_1 = require("./env.config");
// Configuramos Cloudinary con las credenciales del entorno
cloudinary_1.v2.config({
    cloud_name: env_config_1.envConfig.cloudinary.cloudName,
    api_key: env_config_1.envConfig.cloudinary.apiKey,
    api_secret: env_config_1.envConfig.cloudinary.apiSecret,
});
exports.default = cloudinary_1.v2;
