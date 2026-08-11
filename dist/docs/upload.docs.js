"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPaths = void 0;
exports.uploadPaths = {
    '/archivos/imagen': {
        post: {
            tags: ['Archivos'],
            summary: 'Subir una imagen',
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                imagen: {
                                    type: 'string',
                                    format: 'binary',
                                    description: 'Archivo de imagen (jpg, png, webp)',
                                },
                            },
                            required: ['imagen'],
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: 'Imagen subida exitosamente',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    message: { type: 'string', example: 'Imagen subida exitosamente' },
                                    url: { type: 'string', format: 'uri', example: 'https://res.cloudinary.com/...' },
                                },
                            },
                        },
                    },
                },
                400: {
                    description: 'No se ha enviado ninguna imagen',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ApiError',
                            },
                        },
                    },
                },
                401: {
                    description: 'No autorizado',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ApiError',
                            },
                        },
                    },
                },
            },
        },
    },
};
