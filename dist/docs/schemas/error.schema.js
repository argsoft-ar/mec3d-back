"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorSchemaDoc = void 0;
exports.errorSchemaDoc = {
    ApiError: {
        type: 'object',
        properties: {
            error: { type: 'string', example: 'Error message' },
            details: { type: 'object' },
        },
    },
    ValidationError: {
        type: 'object',
        properties: {
            error: { type: 'string', example: 'Error de validación' },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        path: { type: 'array', items: { type: 'string' } },
                        message: { type: 'string' },
                    },
                },
            },
        },
    },
};
