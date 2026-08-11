import pool from "../config/db.config";

const createTables = async () => {
  const ddlQuery = `
    -- 1. Borrar tablas existentes en orden para evitar conflictos de Foreign Keys
    DROP TABLE IF EXISTS productos_fisicos CASCADE;
    DROP TABLE IF EXISTS disenos CASCADE;
    DROP TABLE IF EXISTS categorias CASCADE;
    DROP TABLE IF EXISTS materiales CASCADE;
    DROP TABLE IF EXISTS usuarios CASCADE;
    
    -- Borrar ENUMs si existen (requiere un bloque DO para manejar errores limpiamente si no existen)
    DO $$ BEGIN
        DROP TYPE IF EXISTS rol_usuario CASCADE;
        DROP TYPE IF EXISTS estado_producto CASCADE;
    EXCEPTION
        WHEN undefined_object THEN null;
    END $$;

    -- 2. Crear ENUMs
    CREATE TYPE rol_usuario AS ENUM ('comprador', 'disenador', 'fabricante', 'admin');
    CREATE TYPE estado_producto AS ENUM ('disponible', 'vendido', 'pausado');

    -- 3. Crear Tablas con los nuevos campos para el Frontend
    CREATE TABLE usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rol_principal rol_usuario NOT NULL,
        zona_id INTEGER,
        georef_localidad_id VARCHAR(20),
        puntuacion DECIMAL(3,2) DEFAULT 0.00,
        cuenta_mercadopago VARCHAR(255),
        tagline VARCHAR(255),
        descripcion TEXT,
        experiencia TEXT,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE materiales (
        id SERIAL PRIMARY KEY,
        usuario_id UUID NOT NULL,
        material VARCHAR(100) NOT NULL,
        disponible BOOLEAN DEFAULT TRUE,
        CONSTRAINT fk_usuario_material FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );

    CREATE TABLE categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) UNIQUE NOT NULL,
        descripcion TEXT
    );

    CREATE TABLE disenos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        disenador_id UUID NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT, -- NUEVO
        categoria_id INTEGER,
        archivo_url TEXT NOT NULL, 
        imagen_url TEXT, -- NUEVO: para la portada
        precio_base DECIMAL(10,2) NOT NULL,
        rating DECIMAL(3,2) DEFAULT 0.00, -- NUEVO
        review_count INTEGER DEFAULT 0, -- NUEVO
        descargas INTEGER DEFAULT 0, -- NUEVO
        formato VARCHAR(50), -- NUEVO (ej. 'STL', 'OBJ')
        especificaciones JSONB, -- NUEVO: array de ProductSpec
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_disenador FOREIGN KEY (disenador_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
    );

    CREATE TABLE productos_fisicos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fabricante_id UUID NOT NULL,
        diseno_id UUID NOT NULL, 
        precio_final DECIMAL(10,2) NOT NULL,
        estado estado_producto DEFAULT 'disponible',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_fabricante FOREIGN KEY (fabricante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_diseno FOREIGN KEY (diseno_id) REFERENCES disenos(id) ON DELETE RESTRICT 
    );
  `;

  try {
    console.log("🔄 Borrando base de datos antigua y recreando tablas...");
    await pool.query(ddlQuery);
    console.log(
      "✅ Esquema DDL inicializado con éxito (con campos del Frontend)",
    );
  } catch (error) {
    console.error("❌ Error inicializando base de datos:", error);
  } finally {
    await pool.end();
  }
};

createTables();
