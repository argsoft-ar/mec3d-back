"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disenoRepository = void 0;
const db_config_1 = __importDefault(require("../config/db.config"));
exports.disenoRepository = {
    async getAllProducts() {
        const query = `
      SELECT 
        d.id, d.titulo, d.descripcion, d.imagen_url, d.rating, 
        d.review_count, d.descargas, d.precio_base, d.formato, d.especificaciones,
        u.id AS designer_id,
        u.tagline AS designer_tagline,
        -- Extraemos el nombre del email asumiendo que es temporal, o bien un campo nombre
        split_part(u.email, '@', 1) AS designer_name
      FROM disenos d
      JOIN usuarios u ON d.disenador_id = u.id;
    `;
        const result = await db_config_1.default.query(query);
        return result.rows;
    },
    async createProduct(productData) {
        const query = `
      INSERT INTO disenos (
        disenador_id, titulo, descripcion, imagen_url, 
        archivo_url, precio_base, formato, especificaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ];
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    },
    async updateProduct(id, productData) {
        const query = `
      UPDATE disenos 
      SET titulo = $1, descripcion = $2, imagen_url = $3, archivo_url = $4,
          precio_base = $5, formato = $6, especificaciones = $7
      WHERE id = $8
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
            id,
        ];
        const result = await db_config_1.default.query(query, values);
        return result.rows[0];
    },
    async partialUpdateProduct(id, updates) {
        // Construimos la query dinámicamente según los campos que vengan
        const fields = [];
        const values = [];
        let queryIndex = 1;
        const colMap = {
            imagenUrl: "imagen_url",
            archivoUrl: "archivo_url",
            precioBase: "precio_base",
        };
        for (const [key, value] of Object.entries(updates)) {
            // Mapeamos los nombres del body a las columnas de la BD
            const dbCol = colMap[key] ?? key;
            fields.push(`${dbCol} = $${queryIndex}`);
            values.push(key === "especificaciones" ? JSON.stringify(value) : value);
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
};
