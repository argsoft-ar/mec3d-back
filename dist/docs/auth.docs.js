"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPaths = void 0;
exports.authPaths = {
    '/auth/registro': {
        post: {
            tags: ['Auth'],
            summary: 'Registrar un nuevo usuario',
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/RegisterRequest',
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: 'Usuario registrado exitosamente',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/RegisterResponse',
                            },
                        },
                    },
                },
                400: {
                    description: 'Error de validación',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ValidationError',
                            },
                        },
                    },
                },
                409: {
                    description: 'Email ya registrado',
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
    '/auth/login': {
        post: {
            tags: ['Auth'],
            summary: 'Iniciar sesión',
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/LoginRequest',
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: 'Login exitoso',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/LoginResponse',
                            },
                        },
                    },
                },
                401: {
                    description: 'Credenciales inválidas',
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
