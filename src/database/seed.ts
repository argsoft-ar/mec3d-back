import bcrypt from "bcrypt";
import pool from "../config/db.config";
import { REFERENCE_DATA_SQL } from "./init";
import { guardOrExit } from "./guard";

(async () => {
  // Los usuarios de prueba tienen contraseña conocida (incluido un admin): nunca en producción.
  guardOrExit("db:seed");

  // Sin contraseña por defecto: los usuarios de prueba (incluido un admin) nunca nacen con una conocida.
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 8) {
    console.error(
      "❌ SEED_PASSWORD es obligatoria (mínimo 8 caracteres) para crear los usuarios de prueba",
    );
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // Datos de referencia (idempotente): catálogo, categorías y comisiones.
    await client.query(REFERENCE_DATA_SQL);
    // ── Designer users ───────────────────────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(seedPassword, 10);

    // Los dos primeros tienen cuenta de Mercado Pago y los otros no: permite probar
    // payouts que quedan pendientes por falta de cuenta.
    const designers = [
      {
        email: "designer@mec3d.com",
        tagline:
          "Ingeniero mecánico especializado en autopartes impresas en 3D",
        zona_id: 2028010,
        cuentaMercadopago: "designer.mec3d.mp",
      },
      {
        email: "miguel@mec3d.com",
        tagline: "Diseñador de piezas funcionales para impresión 3D",
        zona_id: 14014010,
        cuentaMercadopago: "miguel.mec3d.mp",
      },
      {
        email: "ana@mec3d.com",
        tagline: "Especialista en automatización y fabricación digital",
        zona_id: 82084020,
        cuentaMercadopago: null,
      },
      {
        email: "carlos@mec3d.com",
        tagline:
          "Entusiasta de la impresión 3D para proyectos marinos e industriales",
        zona_id: 50049010,
        cuentaMercadopago: null,
      },
    ];

    const designerIds: Record<string, string> = {};
    for (const d of designers) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO usuarios (email, password_hash, rol_principal, tagline, zona_id, cuenta_mercadopago)
         VALUES ($1, $2, 'disenador', $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET tagline = EXCLUDED.tagline,
               zona_id = EXCLUDED.zona_id,
               cuenta_mercadopago = EXCLUDED.cuenta_mercadopago
         RETURNING id`,
        [d.email, passwordHash, d.tagline, d.zona_id, d.cuentaMercadopago],
      );
      designerIds[d.email] = result.rows[0].id;
    }

    // Comprador y admin de prueba.
    await client.query(
      `INSERT INTO usuarios (email, password_hash, rol_principal, tagline, zona_id)
       VALUES ('comprador@mec3d.com', $1, 'comprador', 'Comprador de prueba', 2028010),
              ('admin@mec3d.com', $1, 'admin', 'Administrador de prueba', 2028010)
       ON CONFLICT (email) DO NOTHING`,
      [passwordHash],
    );

    // Fabricantes de prueba (impresión 3D); el segundo no tiene cuenta de Mercado Pago.
    const fabricantes = [
      {
        email: "fabricante@mec3d.com",
        tagline: "Impresión 3D FDM de alta precisión",
        zona_id: 2028010,
        cuentaMercadopago: "fabricante.mec3d.mp",
      },
      {
        email: "fabricante2@mec3d.com",
        tagline: "Taller de impresión 3D",
        zona_id: 14014010,
        cuentaMercadopago: null,
      },
    ];

    for (const f of fabricantes) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO usuarios (email, password_hash, rol_principal, tagline, zona_id, cuenta_mercadopago)
         VALUES ($1, $2, 'fabricante', $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET tagline = EXCLUDED.tagline,
               zona_id = EXCLUDED.zona_id,
               cuenta_mercadopago = EXCLUDED.cuenta_mercadopago
         RETURNING id`,
        [f.email, passwordHash, f.tagline, f.zona_id, f.cuentaMercadopago],
      );
      const fabricanteId = result.rows[0].id;

      await client.query(
        `INSERT INTO fabricante_tecnologias (fabricante_id, tecnologia, tecnologia_id)
         SELECT $1, t.nombre, t.id FROM tecnologias t WHERE t.nombre = 'Impresión 3D'
         ON CONFLICT DO NOTHING`,
        [fabricanteId],
      );
      await client.query(
        `INSERT INTO fabricante_materiales (fabricante_id, material, material_id)
         SELECT $1, m.nombre, m.id FROM materiales m
         WHERE m.nombre = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [fabricanteId, ["PLA", "PLA+", "PETG", "ABS", "ASA", "Nylon", "TPU"]],
      );
    }

    // ── Categories ─────────────────────────────────────────────────────────────
    // Las categorías las crea REFERENCE_DATA_SQL.
    const catRows = await client.query<{ id: number; nombre: string }>(
      `SELECT id, nombre FROM categorias`,
    );

    const catMap: Record<string, number> = {};
    for (const row of catRows.rows) {
      catMap[row.nombre] = row.id;
    }

    // ── Diseños ────────────────────────────────────────────────────────────────
    const disenos = [
      // designer@mec3d.com — CABA
      {
        disenador: "designer@mec3d.com",
        titulo: "Soporte de Filtro de Aire Universal",
        descripcion:
          "Soporte imprimible para filtro de aire de admisión universal. Compatible con motores de 4 cilindros de hasta 2.0L.",
        categoria: "Autos",
        archivo_url:
          "https://storage.mec3d.com/files/soporte-filtro-aire-universal.stl",
        imagen_url: "https://placehold.co/600x400?text=Soporte+Filtro+Aire",
        precio_base: 1500,
        rating: 4.6,
        review_count: 18,
        descargas: 72,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["ABS", "ASA"],
        especificaciones: {
          dimensiones: "110x90x35mm",
          dificultad: "Intermedio",
          tiempoImpresion: 4,
          soportes: "Necesarios",
          configuracion: { layer: "0.2mm", infill: "40%" },
        },
      },
      {
        disenador: "designer@mec3d.com",
        titulo: "Engranaje Helicoidal 20T",
        descripcion:
          "Engranaje helicoidal de 20 dientes para transmisiones de baja vibración. Compatible con módulo 1.5.",
        categoria: "Engranajes",
        archivo_url:
          "https://storage.mec3d.com/files/engranaje-helicoidal-20t.stl",
        imagen_url:
          "https://placehold.co/600x400?text=Engranaje+Helicoidal+20T",
        precio_base: 1800,
        rating: 4.8,
        review_count: 34,
        descargas: 145,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["Nylon", "Fibra de carbono (CF)"],
        especificaciones: {
          dimensiones: "60x60x20mm",
          dificultad: "Avanzado",
          tiempoImpresion: 5,
          soportes: "No necesarios",
          configuracion: { layer: "0.15mm", infill: "50%" },
        },
      },
      // miguel@mec3d.com — Córdoba
      {
        disenador: "miguel@mec3d.com",
        titulo: "Guía de Corte para Sierra de Cinta",
        descripcion:
          "Guía ajustable para sierra de cinta industrial de 14 pulgadas. Mejora la precisión de corte en maderas duras.",
        categoria: "Maquinas",
        archivo_url:
          "https://storage.mec3d.com/files/guia-corte-sierra-cinta.stl",
        imagen_url: "https://placehold.co/600x400?text=Guia+Corte+Sierra+Cinta",
        precio_base: 2200,
        rating: 4.7,
        review_count: 15,
        descargas: 61,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["ABS", "PETG"],
        especificaciones: {
          dimensiones: "150x80x50mm",
          dificultad: "Avanzado",
          tiempoImpresion: 6,
          soportes: "Necesarios",
          configuracion: { layer: "0.2mm", infill: "60%" },
        },
      },
      {
        disenador: "miguel@mec3d.com",
        titulo: "Protector de Cadena para Moto",
        descripcion:
          "Cubierta protectora para cadena de transmisión de moto. Reduce el barro y los residuos en la transmisión.",
        categoria: "Motos",
        archivo_url:
          "https://storage.mec3d.com/files/protector-cadena-moto.stl",
        imagen_url: "https://placehold.co/600x400?text=Protector+Cadena+Moto",
        precio_base: 1200,
        rating: 4.3,
        review_count: 12,
        descargas: 58,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["PETG", "ASA", "TPU"],
        especificaciones: {
          dimensiones: "200x60x25mm",
          dificultad: "Básico",
          tiempoImpresion: 3,
          soportes: "No necesarios",
          configuracion: { layer: "0.2mm", infill: "30%" },
        },
      },
      // ana@mec3d.com — Santa Fe
      {
        disenador: "ana@mec3d.com",
        titulo: "Soporte para Cerradura de Seguridad",
        descripcion:
          "Soporte de montaje para cerradura de embutir estándar. Fijación directa a la puerta sin tornillos visibles.",
        categoria: "Casa",
        archivo_url:
          "https://storage.mec3d.com/files/soporte-cerradura-seguridad.stl",
        imagen_url: "https://placehold.co/600x400?text=Soporte+Cerradura",
        precio_base: 750,
        rating: 4.4,
        review_count: 22,
        descargas: 90,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["PLA+", "PLA", "PETG"],
        especificaciones: {
          dimensiones: "95x60x20mm",
          dificultad: "Básico",
          tiempoImpresion: 2,
          soportes: "No necesarios",
          configuracion: { layer: "0.15mm", infill: "40%" },
        },
      },
      {
        disenador: "ana@mec3d.com",
        titulo: "Engranaje Planetario Modular",
        descripcion:
          "Sistema de engranajes planetarios con relación 1:4, imprimible en PLA o PETG. Ideal para robótica y automatización.",
        categoria: "Engranajes",
        archivo_url: "https://storage.mec3d.com/files/engranaje-planetario.stl",
        imagen_url: "https://placehold.co/600x400?text=Engranaje+Planetario",
        precio_base: 800,
        rating: 4.5,
        review_count: 98,
        descargas: 1800,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["PLA", "PETG"],
        especificaciones: {
          dimensiones: "80x80x45mm",
          dificultad: "Intermedio",
          tiempoImpresion: 8,
          soportes: "No necesarios",
          configuracion: { layer: "0.2mm", infill: "30%" },
        },
      },
      // carlos@mec3d.com — Mendoza
      {
        disenador: "carlos@mec3d.com",
        titulo: "Soporte de Cornamusa Náutica",
        descripcion:
          "Cornamusa de muelle para embarcaciones menores. Resistente a la humedad y la sal.",
        categoria: "Barcos",
        archivo_url:
          "https://storage.mec3d.com/files/soporte-cornamusa-nautica.stl",
        imagen_url:
          "https://placehold.co/600x400?text=Soporte+Cornamusa+Nautica",
        precio_base: 900,
        rating: 4.1,
        review_count: 7,
        descargas: 34,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["Nylon", "ASA"],
        especificaciones: {
          dimensiones: "80x40x30mm",
          dificultad: "Básico",
          tiempoImpresion: 2,
          soportes: "No necesarios",
          configuracion: { layer: "0.2mm", infill: "50%" },
        },
      },
      {
        disenador: "carlos@mec3d.com",
        titulo: "Soporte Motor V8",
        descripcion:
          "Soporte de motor de alta resistencia para vehículos de competición. Compatible con bloques V8 estándar, montaje mediante tornillos M8.",
        categoria: "Autos",
        archivo_url: "https://storage.mec3d.com/files/soporte-motor-v8.stl",
        imagen_url: "https://placehold.co/600x400?text=Soporte+Motor+V8",
        precio_base: 1500,
        rating: 4.8,
        review_count: 214,
        descargas: 2400,
        formato: "STL",
        tecnologia: "Impresión 3D",
        materiales: ["PETG", "Nylon"],
        especificaciones: {
          dimensiones: "320x180x120mm",
          dificultad: "Avanzado",
          tiempoImpresion: 14,
          soportes: "Necesarios",
          configuracion: { layer: "0.15mm", infill: "40%" },
        },
      },
    ];

    for (const d of disenos) {
      const catId = catMap[d.categoria] ?? null;
      const disenadorId = designerIds[d.disenador];

      await client.query(
        `INSERT INTO disenos
           (disenador_id, titulo, descripcion, categoria_id, archivo_url, imagen_url,
            precio_base, rating, review_count, descargas, formato, especificaciones,
            tecnologia_id)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
                (SELECT id FROM tecnologias WHERE nombre = $13)
         WHERE NOT EXISTS (
           SELECT 1 FROM disenos WHERE titulo = $2::varchar
         )`,
        [
          disenadorId,
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
          d.tecnologia,
        ],
      );

      await client.query(
        `INSERT INTO diseno_materiales (diseno_id, material_id)
         SELECT d.id, m.id
         FROM disenos d
         JOIN materiales m ON m.nombre = ANY($2::text[])
         WHERE d.titulo = $1::varchar
         ON CONFLICT DO NOTHING`,
        [d.titulo, d.materiales],
      );
    }

    console.log("✅ Seed completed successfully.");
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
