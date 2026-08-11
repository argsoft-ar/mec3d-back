import bcrypt from "bcrypt";
import pool from "../config/db.config";

(async () => {
  const client = await pool.connect();

  try {
    // ── Designer users ─────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("password123", 10);

    const designers = [
      {
        email: "designer@mec3d.com",
        tagline:
          "Ingeniero mecánico especializado en autopartes impresas en 3D",
        zona_id: 2028010,
      },
      {
        email: "miguel@mec3d.com",
        tagline: "Diseñador de piezas funcionales para impresión 3D",
        zona_id: 14014010,
      },
      {
        email: "ana@mec3d.com",
        tagline: "Especialista en automatización y fabricación digital",
        zona_id: 82084020,
      },
      {
        email: "carlos@mec3d.com",
        tagline:
          "Entusiasta de la impresión 3D para proyectos marinos e industriales",
        zona_id: 50049010,
      },
    ];

    const designerIds: Record<string, string> = {};
    for (const d of designers) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO usuarios (email, password_hash, rol_principal, tagline, zona_id)
         VALUES ($1, $2, 'disenador', $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET tagline = EXCLUDED.tagline,
               zona_id = EXCLUDED.zona_id
         RETURNING id`,
        [d.email, passwordHash, d.tagline, d.zona_id],
      );
      designerIds[d.email] = result.rows[0].id;
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
      await client.query(
        `INSERT INTO categorias (nombre, descripcion)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO NOTHING`,
        [cat.nombre, cat.descripcion],
      );
    }

    const catRows = await client.query<{ id: number; nombre: string }>(
      `SELECT id, nombre FROM categorias WHERE nombre = ANY($1)`,
      [categories.map((c) => c.nombre)],
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
        especificaciones: {
          material: "Nylon",
          dimensiones: "60x60x20mm",
          dificultad: "Avanzado",
          tiempoImpresion: "5h",
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
        especificaciones: {
          material: "PETG",
          dimensiones: "200x60x25mm",
          dificultad: "Básico",
          tiempoImpresion: "3h",
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
        especificaciones: {
          material: "PLA / PETG",
          dimensiones: "80x80x45mm",
          dificultad: "Intermedio",
          tiempoImpresion: "8h",
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
        especificaciones: {
          material: "PETG",
          dimensiones: "320x180x120mm",
          dificultad: "Avanzado",
          tiempoImpresion: "14h",
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
            precio_base, rating, review_count, descargas, formato, especificaciones)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
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
        ],
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
