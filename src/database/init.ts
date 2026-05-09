import pool from '../config/db.config';

const createTables = async () => {
  const ddlQuery = `
    DO $$ BEGIN
        CREATE TYPE rol_usuario AS ENUM ('comprador', 'disenador', 'fabricante', 'admin');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
        CREATE TYPE estado_producto AS ENUM ('disponible', 'vendido', 'pausado');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rol_principal rol_usuario NOT NULL,
        zona_id INTEGER, 
        puntuacion DECIMAL(3,2) DEFAULT 0.00,
        cuenta_mercadopago VARCHAR(255),
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) UNIQUE NOT NULL,
        descripcion TEXT
    );

    CREATE TABLE IF NOT EXISTS disenos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        disenador_id UUID NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        categoria_id INTEGER,
        archivo_url TEXT NOT NULL, 
        precio_base DECIMAL(10,2) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_disenador FOREIGN KEY (disenador_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS productos_fisicos (
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
    console.log('🔄 Inicializando base de datos y creando tablas si no existen...');
    await pool.query(ddlQuery);
    console.log('✅ Esquema DDL inicializado con éxito');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  } finally {
    await pool.end();
  }
};

createTables();
