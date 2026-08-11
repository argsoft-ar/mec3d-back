"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numericIdParamSchema = exports.uuidParamSchema = void 0;
const zod_1 = require("zod");
// Schema para validar UUID en params
exports.uuidParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('El ID debe ser un UUID válido'),
    }),
});
// Schema para validar ID numérico en params
exports.numericIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().regex(/^\d+$/, 'El ID debe ser un número').transform(Number),
    }),
});
