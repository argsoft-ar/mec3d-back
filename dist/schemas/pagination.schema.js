"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = void 0;
const zod_1 = require("zod");
exports.paginationSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z
            .string()
            .regex(/^\d+$/, 'page debe ser un número entero positivo')
            .transform(Number)
            .default('1'),
        limit: zod_1.z
            .string()
            .regex(/^\d+$/, 'limit debe ser un número entero positivo')
            .transform(Number)
            .default('12'),
    }),
});
