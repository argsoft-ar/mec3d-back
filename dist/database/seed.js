"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const db_config_1 = __importDefault(require("../config/db.config"));
(async () => {
    const client = await db_config_1.default.connect();
    try {
        // ── Designer user ──────────────────────────────────────────────────────────
        const passwordHash = await bcrypt_1.default.hash("password123", 10);
        const designerResult = await client.query(`INSERT INTO usuarios (email, password_hash, rol_principal)
       VALUES ($1, $2, 'disenador')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`, ["designer@mec3d.com", passwordHash]);
        // If the user already existed, fetch their id
        let designerId;
        if (designerResult.rows.length > 0) {
            designerId = designerResult.rows[0].id;
        }
        else {
            const existing = await client.query(`SELECT id FROM usuarios WHERE email = $1`, ["designer@mec3d.com"]);
            designerId = existing.rows[0].id;
        }
        // ── Categories ─────────────────────────────────────────────────────────────
        const categories = [
            { nombre: "Autos", descripcion: "Piezas y repuestos para automóviles" },
            { nombre: "Motos", descripcion: "Componentes y accesorios para motos" },
            { nombre: "Barcos", descripcion: "Partes náuticas y marinas" },
            { nombre: "Casa", descripcion: "Herrajes, cerraduras y más" },
            {
                nombre: "Maquinas",
                descripcion: "Piezas industriales y de producción",
            },
            {
                nombre: "Engranajes",
                descripcion: "Transmisiones, poleas y sistemas mecánicos",
            },
        ];
        for (const cat of categories) {
            await client.query(`INSERT INTO categorias (nombre, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO NOTHING`, [cat.nombre, cat.descripcion]);
        }
        const catRows = await client.query(`SELECT id, nombre FROM categorias WHERE nombre = ANY($1)`, [categories.map((c) => c.nombre)]);
        const catMap = {};
        for (const row of catRows.rows) {
            catMap[row.nombre] = row.id;
        }
        // ── Diseños ────────────────────────────────────────────────────────────────
        const disenos = [
            {
                titulo: "Soporte de Filtro de Aire Universal",
                descripcion: "Soporte imprimible para filtro de aire de admisión universal. Compatible con motores de 4 cilindros de hasta 2.0L.",
                categoria: "Autos",
                archivo_url: "https://storage.mec3d.com/files/soporte-filtro-aire-universal.stl",
                imagen_url: "https://placehold.co/600x400?text=Soporte+Filtro+Aire",
                precio_base: 1500,
                rating: 4.6,
                review_count: 18,
                descargas: 72,
                formato: "STL",
                especificaciones: {
                    material: "ABS",
                    dimensiones: "110x90x35mm",
                    dificultad: "Intermedio",
                    tiempoImpresion: "4h",
                    soportes: "Necesarios",
                    configuracion: { layer: "0.2mm", infill: "40%" },
                },
            },
            {
                titulo: "Protector de Cadena para Moto",
                descripcion: "Cubierta protectora para cadena de transmisión de moto. Reduce el barro y los residuos en la transmisión.",
                categoria: "Motos",
                archivo_url: "https://storage.mec3d.com/files/protector-cadena-moto.stl",
                imagen_url: "https://placehold.co/600x400?text=Protector+Cadena+Moto",
                precio_base: 1200,
                rating: 4.3,
                review_count: 12,
                descargas: 58,
                formato: "STL",
                especificaciones: {
                    material: "PETG",
                    dimensiones: "200x60x25mm",
                    dificultad: "Básico",
                    tiempoImpresion: "3h",
                    soportes: "No necesarios",
                    configuracion: { layer: "0.2mm", infill: "30%" },
                },
            },
            {
                titulo: "Soporte de Cornamusa Náutica",
                descripcion: "Cornamusa de muelle para embarcaciones menores. Resistente a la humedad y la sal.",
                categoria: "Barcos",
                archivo_url: "https://storage.mec3d.com/files/soporte-cornamusa-nautica.stl",
                imagen_url: "https://placehold.co/600x400?text=Soporte+Cornamusa+Nautica",
                precio_base: 900,
                rating: 4.1,
                review_count: 7,
                descargas: 34,
                formato: "STL",
                especificaciones: {
                    material: "Nylon",
                    dimensiones: "80x40x30mm",
                    dificultad: "Básico",
                    tiempoImpresion: "2h",
                    soportes: "No necesarios",
                    configuracion: { layer: "0.2mm", infill: "50%" },
                },
            },
            {
                titulo: "Soporte para Cerradura de Seguridad",
                descripcion: "Soporte de montaje para cerradura de embutir estándar. Fijación directa a la puerta sin tornillos visibles.",
                categoria: "Casa",
                archivo_url: "https://storage.mec3d.com/files/soporte-cerradura-seguridad.stl",
                imagen_url: "https://placehold.co/600x400?text=Soporte+Cerradura",
                precio_base: 750,
                rating: 4.4,
                review_count: 22,
                descargas: 90,
                formato: "STL",
                especificaciones: {
                    material: "PLA+",
                    dimensiones: "95x60x20mm",
                    dificultad: "Básico",
                    tiempoImpresion: "2h",
                    soportes: "No necesarios",
                    configuracion: { layer: "0.15mm", infill: "40%" },
                },
            },
            {
                titulo: "Guía de Corte para Sierra de Cinta",
                descripcion: "Guía ajustable para sierra de cinta industrial de 14 pulgadas. Mejora la precisión de corte en maderas duras.",
                categoria: "Maquinas",
                archivo_url: "https://storage.mec3d.com/files/guia-corte-sierra-cinta.stl",
                imagen_url: "https://placehold.co/600x400?text=Guia+Corte+Sierra+Cinta",
                precio_base: 2200,
                rating: 4.7,
                review_count: 15,
                descargas: 61,
                formato: "STL",
                especificaciones: {
                    material: "ABS",
                    dimensiones: "150x80x50mm",
                    dificultad: "Avanzado",
                    tiempoImpresion: "6h",
                    soportes: "Necesarios",
                    configuracion: { layer: "0.2mm", infill: "60%" },
                },
            },
            {
                titulo: "Engranaje Helicoidal 20T",
                descripcion: "Engranaje helicoidal de 20 dientes para transmisiones de baja vibración. Compatible con módulo 1.5.",
                categoria: "Engranajes",
                archivo_url: "https://storage.mec3d.com/files/engranaje-helicoidal-20t.stl",
                imagen_url: "https://placehold.co/600x400?text=Engranaje+Helicoidal+20T",
                precio_base: 1800,
                rating: 4.8,
                review_count: 34,
                descargas: 145,
                formato: "STL",
                especificaciones: {
                    material: "Nylon",
                    dimensiones: "60x60x20mm",
                    dificultad: "Avanzado",
                    tiempoImpresion: "5h",
                    soportes: "No necesarios",
                    configuracion: { layer: "0.15mm", infill: "50%" },
                },
            },
        ];
        for (const d of disenos) {
            const catId = catMap[d.categoria] ?? null;
            await client.query(`INSERT INTO disenos
           (disenador_id, titulo, descripcion, categoria_id, archivo_url, imagen_url,
            precio_base, rating, review_count, descargas, formato, especificaciones)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM disenos WHERE titulo = $2::varchar
         )`, [
                designerId,
                d.titulo,
                d.descripcion,
                catId,
                d.archivo_url,
                d.imagen_url,
                d.precio_base,
                d.rating,
                d.review_count,
                d.descargas,
                d.formato,
                JSON.stringify(d.especificaciones),
            ]);
        }
        console.log("✅ Seed completed successfully.");
    }
    catch (err) {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    }
    finally {
        client.release();
        await db_config_1.default.end();
    }
})();
