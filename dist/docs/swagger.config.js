"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const user_schema_1 = require("./schemas/user.schema");
const product_schema_1 = require("./schemas/product.schema");
const error_schema_1 = require("./schemas/error.schema");
const pagination_schema_1 = require("./schemas/pagination.schema");
const auth_docs_1 = require("./auth.docs");
const product_docs_1 = require("./product.docs");
const upload_docs_1 = require("./upload.docs");
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MEC3D API',
            version: '1.0.0',
            description: 'API para la plataforma de diseños 3D MEC3D',
            contact: {
                name: 'Soporte MEC3D',
                email: 'soporte@mec3d.com',
            },
        },
        servers: [
            {
                url: '/api/v1',
                description: 'API v1',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                ...user_schema_1.userSchemaDoc,
                ...product_schema_1.productSchemaDoc,
                ...error_schema_1.errorSchemaDoc,
                ...pagination_schema_1.paginationSchemaDoc,
            },
        },
        paths: {
            ...auth_docs_1.authPaths,
            ...product_docs_1.productPaths,
            ...upload_docs_1.uploadPaths,
        },
    },
    apis: [], // No usamos JSDoc en archivos, todo está definido en este archivo
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
