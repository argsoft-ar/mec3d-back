import bcrypt from "bcrypt";
import pool from "../config/db.config";

(async () => {
  const client = await pool.connect();

  try {
    // ── Designer user ──────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("password123", 10);

    const designerResult = await client.query<{ id: string }>(
      `INSERT INTO usuarios (email, password_hash, rol_principal)
       VALUES ($1, $2, 'disenador')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ["designer@mec3d.com", passwordHash],
    );

    // If the user already existed, fetch their id
    let designerId: string;
    if (designerResult.rows.length > 0) {
      designerId = designerResult.rows[0].id;
    } else {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM usuarios WHERE email = $1`,
        ["designer@mec3d.com"],
      );
      designerId = existing.rows[0].id;
    }

    // ── Categories ─────────────────────────────────────────────────────────────
    const categories = [
      {
        nombre: "Mecánica",
        descripcion: "Piezas y componentes mecánicos funcionales",
      },
      {
        nombre: "Decoración",
        descripcion: "Objetos decorativos y artísticos para el hogar",
      },
      {
        nombre: "Electrónica",
        descripcion: "Carcasas, soportes y accesorios para electrónica",
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
      {
        titulo: "Engranaje Helicoidal 20T",
        descripcion:
          "Engranaje helicoidal de 20 dientes diseñado para transmisiones de baja vibración. Compatible con módulo 1.5.",
        categoria: "Mecánica",
        archivo_url:
          "https://storage.mec3d.com/files/engranaje-helicoidal-20t.stl",
        imagen_url:
          "https://placehold.co/600x400?text=Engranaje+Helicoidal+20T",
        precio_base: 1200,
        rating: 4.8,
        review_count: 34,
        descargas: 145,
        formato: "STL",
        especificaciones: [
          { label: "Dientes", value: "20" },
          { label: "Módulo", value: "1.5" },
          { label: "Material recomendado", value: "PETG / Nylon" },
          { label: "Altura de capa", value: "0.2 mm" },
          { label: "Relleno", value: "40%" },
        ],
      },
      {
        titulo: "Soporte Articulado para Monitor",
        descripcion:
          'Soporte de escritorio con brazo articulado de 180° para monitores de hasta 27". Fijación por abrazadera.',
        categoria: "Mecánica",
        archivo_url:
          "https://storage.mec3d.com/files/soporte-articulado-monitor.stl",
        imagen_url:
          "https://placehold.co/600x400?text=Soporte+Articulado+Monitor",
        precio_base: 2800,
        rating: 4.5,
        review_count: 21,
        descargas: 98,
        formato: "STL",
        especificaciones: [
          { label: "Peso máximo soportado", value: "8 kg" },
          { label: "Rango de articulación", value: "180°" },
          { label: "Material recomendado", value: "PLA+" },
          { label: "Altura de capa", value: "0.15 mm" },
          { label: "Relleno", value: "60%" },
        ],
      },
      {
        titulo: "Maceta Geométrica Facetada",
        descripcion:
          "Maceta de diseño geométrico facetado, estilo moderno. Ideal para suculentas y cactus de interior.",
        categoria: "Decoración",
        archivo_url:
          "https://storage.mec3d.com/files/maceta-geometrica-facetada.stl",
        imagen_url:
          "https://placehold.co/600x400?text=Maceta+Geometrica+Facetada",
        precio_base: 750,
        rating: 4.9,
        review_count: 47,
        descargas: 190,
        formato: "STL",
        especificaciones: [
          { label: "Dimensiones", value: "120 × 120 × 150 mm" },
          { label: "Material recomendado", value: "PLA" },
          { label: "Altura de capa", value: "0.2 mm" },
          { label: "Relleno", value: "15%" },
          { label: "Requiere soporte", value: "No" },
        ],
      },
      {
        titulo: "Marco Decorativo Entrelazado",
        descripcion:
          "Marco de foto decorativo con patrón entrelazado tipo cesta. Disponible para fotos 10×15 cm.",
        categoria: "Decoración",
        archivo_url:
          "https://storage.mec3d.com/files/marco-decorativo-entrelazado.obj",
        imagen_url:
          "https://placehold.co/600x400?text=Marco+Decorativo+Entrelazado",
        precio_base: 500,
        rating: 3.8,
        review_count: 8,
        descargas: 32,
        formato: "OBJ",
        especificaciones: [
          { label: "Tamaño de foto", value: "10 × 15 cm" },
          { label: "Material recomendado", value: "PLA" },
          { label: "Altura de capa", value: "0.2 mm" },
          { label: "Relleno", value: "20%" },
          { label: "Acabado", value: "Lija 400 + pintura" },
        ],
      },
      {
        titulo: "Carcasa para Raspberry Pi 4 con Ventilación",
        descripcion:
          "Carcasa compacta para Raspberry Pi 4 con ranuras de ventilación laterales y acceso a todos los puertos.",
        categoria: "Electrónica",
        archivo_url:
          "https://storage.mec3d.com/files/carcasa-raspberry-pi4.stl",
        imagen_url: "https://placehold.co/600x400?text=Carcasa+Raspberry+Pi+4",
        precio_base: 1800,
        rating: 4.7,
        review_count: 29,
        descargas: 167,
        formato: "STL",
        especificaciones: [
          { label: "Compatible con", value: "Raspberry Pi 4 Model B" },
          { label: "Material recomendado", value: "PETG" },
          { label: "Altura de capa", value: "0.15 mm" },
          { label: "Relleno", value: "30%" },
          {
            label: "Ventilación",
            value: "Ranuras laterales + slot para cooler 30mm",
          },
        ],
      },
      {
        titulo: "Clip Organizador de Cables para Mesa",
        descripcion:
          "Clip adhesivo de montaje bajo mesa para organizar cables USB, HDMI y de corriente. Pack de 4 unidades.",
        categoria: "Electrónica",
        archivo_url:
          "https://storage.mec3d.com/files/clip-organizador-cables.stl",
        imagen_url: "https://placehold.co/600x400?text=Clip+Organizador+Cables",
        precio_base: 600,
        rating: 3.5,
        review_count: 3,
        descargas: 18,
        formato: "STL",
        especificaciones: [
          { label: "Unidades por archivo", value: "4" },
          { label: "Diámetro máximo de cable", value: "8 mm" },
          { label: "Material recomendado", value: "TPU 95A" },
          { label: "Altura de capa", value: "0.2 mm" },
          { label: "Relleno", value: "25%" },
        ],
      },
    ];

    for (const d of disenos) {
      const catId = catMap[d.categoria] ?? null;

      await client.query(
        `INSERT INTO disenos
           (disenador_id, titulo, descripcion, categoria_id, archivo_url, imagen_url,
            precio_base, rating, review_count, descargas, formato, especificaciones)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM disenos WHERE titulo = $2::varchar
         )`,
        [
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
