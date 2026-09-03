import pool from "../config/db.config";

const migrate = async () => {
  const sql = `
    -- usuarios: new profile columns
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puntuacion       DECIMAL(3,2)  DEFAULT 0.00;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cuenta_mercadopago VARCHAR(255);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tagline          VARCHAR(255);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descripcion      TEXT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS experiencia      TEXT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS actualizado_en   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS georef_localidad_id VARCHAR(20);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username         VARCHAR(30)   UNIQUE;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono         VARCHAR(30);
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion        VARCHAR(255);

    -- fabricante_materiales: create if missing
    CREATE TABLE IF NOT EXISTS fabricante_materiales (
      id            SERIAL PRIMARY KEY,
      fabricante_id UUID         NOT NULL,
      material      VARCHAR(100) NOT NULL,
      disponible    BOOLEAN      DEFAULT true,
      creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_fabricante_mat FOREIGN KEY (fabricante_id)
        REFERENCES usuarios(id) ON DELETE CASCADE,
      CONSTRAINT uq_fabricante_material UNIQUE (fabricante_id, material)
    );

    -- fabricante_tecnologias: create if missing
    CREATE TABLE IF NOT EXISTS fabricante_tecnologias (
      id            SERIAL PRIMARY KEY,
      fabricante_id UUID         NOT NULL,
      tecnologia    VARCHAR(100) NOT NULL,
      disponible    BOOLEAN      DEFAULT true,
      creado_en     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_fabricante_tec FOREIGN KEY (fabricante_id)
        REFERENCES usuarios(id) ON DELETE CASCADE,
      CONSTRAINT uq_fabricante_tecnologia UNIQUE (fabricante_id, tecnologia)
    );

    -- seed standard categories if missing
    INSERT INTO categorias (nombre, descripcion) VALUES
      ('Autos',       'Piezas y repuestos para automóviles'),
      ('Motos',       'Componentes y accesorios para motos'),
      ('Barcos',      'Partes náuticas y marinas'),
      ('Casa',        'Herrajes, cerraduras y más'),
      ('Maquinas',    'Piezas industriales y de producción'),
      ('Engranajes',  'Transmisiones, poleas y sistemas mecánicos')
    ON CONFLICT (nombre) DO NOTHING;
  `;

  try {
    console.log("🔄 Aplicando migración...");
    await pool.query(sql);
    console.log("✅ Migración completada sin pérdida de datos");
  } catch (error) {
    console.error("❌ Error en migración:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

migrate();
