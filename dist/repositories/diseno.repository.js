"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disenoRepository = void 0;
const db_config_1 = __importDefault(require("../config/db.config"));
const COLUMN_MAP = {
    imagenUrl: "imagen_url",
    archivoUrl: "archivo_url",
    precioBase: "precio_base",
};
exports.disenoRepository = {
    async getAllProducts() {
        const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id;
    `;
        const result = await db_config_1.default.query(query);
        return result.rows;
    },
    async getAllProductsPaginated(limit, offset) {
        const countQuery = `SELECT COUNT(*) FROM disenos;`;
        const countResult = await db_config_1.default.query(countQuery);
        const total = parseInt(countResult.rows[0].count, 10);
        const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      ORDER BY d.creado_en DESC
      LIMIT $1 OFFSET $2;
    `;
        const result = await db_config_1.default.query(query, [limit, offset]);
        return { rows: result.rows, total };
    },
    async getByIdWithDesigner(id) {
        const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        d.disenador_id,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      WHERE d.id = $1;
    `;
        const result = await db_config_1.default.query(query, [id]);
        return result.rows[0] ?? null;
    },
    async createProduct(productData) {
        let categoriaId = null;
        if (productData.categoria) {
            const catResult = await db_config_1.default.query(`SELECT id FROM categorias WHERE nombre = $1`, [productData.categoria]);
            categoriaId = catResult.rows[0]?.id ?? null;
        }
        const query = `
      INSERT INTO disenos (
        disenador_id, titulo, descripcion, imagen_url, 
        archivo_url, precio_base, formato, especificaciones, categoria_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
        const values = [
            productData.disenadorId,
            productData.titulo,
            productData.descripcion || null,
            productData.imagenUrl || null,
            productData.archivoUrl,
            productData.precioBase,
            productData.formato || null,
            productData.especificaciones
                ? JSON.stringify(productData.especificaciones)
                : null,
            categoriaId,
        ];
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    },
    async updateProduct(id, productData) {
        let categoriaId = null;
        if (productData.categoria) {
            const catResult = await db_config_1.default.query(`SELECT id FROM categorias WHERE nombre = $1`, [productData.categoria]);
            categoriaId = catResult.rows[0]?.id ?? null;
        }
        const query = `
      UPDATE disenos 
      SET titulo = $1, descripcion = $2, imagen_url = $3, archivo_url = $4,
          precio_base = $5, formato = $6, especificaciones = $7, categoria_id = $8
      WHERE id = $9
      RETURNING *;
    `;
        const values = [
            productData.titulo,
            productData.descripcion || null,
            productData.imagenUrl || null,
            productData.archivoUrl,
            productData.precioBase,
            productData.formato || null,
            productData.especificaciones
                ? JSON.stringify(productData.especificaciones)
                : null,
            categoriaId,
            id,
        ];
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    },
    async partialUpdateProduct(id, updates) {
        const fields = [];
        const values = [];
        let queryIndex = 1;
        let categoriaId = undefined;
        if ("categoria" in updates) {
            if (updates.categoria) {
                const catResult = await db_config_1.default.query(`SELECT id FROM categorias WHERE nombre = $1`, [updates.categoria]);
                categoriaId = catResult.rows[0]?.id ?? null;
            }
            else {
                categoriaId = null;
            }
        }
        for (const [key, value] of Object.entries(updates)) {
            if (key === "categoria")
                continue;
            const dbCol = COLUMN_MAP[key] ?? key;
            fields.push(`${dbCol} = $${queryIndex}`);
            values.push(key === "especificaciones" ? JSON.stringify(value) : value);
            queryIndex++;
        }
        if (categoriaId !== undefined) {
            fields.push(`categoria_id = $${queryIndex}`);
            values.push(categoriaId);
            queryIndex++;
        }
        if (fields.length === 0)
            return null;
        values.push(id);
        const query = `
      UPDATE disenos 
      SET ${fields.join(", ")} 
      WHERE id = $${queryIndex}
      RETURNING *;
    `;
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    },
    async deleteProduct(id) {
        const query = `DELETE FROM disenos WHERE id = $1 RETURNING id;`;
        const result = await db_config_1.default.query(query, [id]);
        return result.rows[0];
    },
    async getById(id) {
        const query = `SELECT * FROM disenos WHERE id = $1;`;
        const result = await db_config_1.default.query(query, [id]);
        return result.rows[0] ?? null;
    },
    async getByDesigner(designerId) {
        const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        split_part(u.email, '@', 1) AS designer_name,
        c.nombre AS categoria_nombre
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id
      LEFT JOIN categorias c ON d.categoria_id = c.id
      WHERE d.disenador_id = $1;
    `;
        const result = await db_config_1.default.query(query, [designerId]);
        return result.rows;
    },
};
