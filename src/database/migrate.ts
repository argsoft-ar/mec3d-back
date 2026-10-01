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

    -- disenos: soft-delete. Una compra puede referenciar el diseño, por lo que el
    -- flujo de borrado deja de ser un DELETE físico y pasa a marcar esta columna.
    ALTER TABLE disenos ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP NULL;

    -- compras: se crea al comprar descarga directa o al confirmarse una fabricación.
    -- id_disenador es una copia (snapshot) del disenador_id de disenos al momento de
    -- la compra: se conserva para auditoría/regalías aunque el diseño luego se reasigne o se borre.
    CREATE TABLE IF NOT EXISTS compras (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      id_comprador            UUID NOT NULL,
      id_modelo               UUID NOT NULL,
      id_disenador            UUID NOT NULL,
      precio_pagado           NUMERIC(12,2) NOT NULL,
      fecha                   TIMESTAMP DEFAULT now(),
      token_verificacion_hash VARCHAR(128) UNIQUE NOT NULL,
      entrega_confirmada      BOOLEAN DEFAULT false,
      entregado_en            TIMESTAMP NULL,
      fondos_liberados        BOOLEAN DEFAULT false,
      fondos_liberados_en     TIMESTAMP NULL,
      CONSTRAINT fk_compra_comprador FOREIGN KEY (id_comprador) REFERENCES usuarios(id),
      CONSTRAINT fk_compra_modelo    FOREIGN KEY (id_modelo)    REFERENCES disenos(id),
      CONSTRAINT fk_compra_disenador FOREIGN KEY (id_disenador) REFERENCES usuarios(id)
    );

    -- ordenes_fabricacion: una fila por fabricante contactado para una misma compra.
    CREATE TABLE IF NOT EXISTS ordenes_fabricacion (
      id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      compra_id                    UUID NOT NULL,
      fabricante_id                UUID NOT NULL,
      estado                       VARCHAR(20) NOT NULL DEFAULT 'solicitado'
        CHECK (estado IN ('solicitado', 'en_negociacion', 'trato_cerrado', 'rechazado', 'cancelado', 'completado')),
      precio_acordado              NUMERIC(12,2) NULL,
      precio_propuesto_comprador   NUMERIC(12,2) NULL,
      precio_propuesto_fabricante  NUMERIC(12,2) NULL,
      cerrado_por_comprador        BOOLEAN DEFAULT false,
      cerrado_por_fabricante       BOOLEAN DEFAULT false,
      cerrado_en                   TIMESTAMP NULL,
      creado_en                    TIMESTAMP DEFAULT now(),
      CONSTRAINT fk_orden_compra      FOREIGN KEY (compra_id)      REFERENCES compras(id),
      CONSTRAINT fk_orden_fabricante  FOREIGN KEY (fabricante_id) REFERENCES usuarios(id)
    );

    -- conversaciones: un chat 1 a 1 por orden de fabricación.
    CREATE TABLE IF NOT EXISTS conversaciones (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      orden_fabricacion_id  UUID UNIQUE NOT NULL,
      comprador_id          UUID NOT NULL,
      fabricante_id         UUID NOT NULL,
      creado_en             TIMESTAMP DEFAULT now(),
      CONSTRAINT fk_conversacion_orden      FOREIGN KEY (orden_fabricacion_id) REFERENCES ordenes_fabricacion(id),
      CONSTRAINT fk_conversacion_comprador  FOREIGN KEY (comprador_id)         REFERENCES usuarios(id),
      CONSTRAINT fk_conversacion_fabricante FOREIGN KEY (fabricante_id)        REFERENCES usuarios(id)
    );

    -- mensajes: remitente_id NULL identifica un mensaje de sistema (ej. "trato cerrado").
    CREATE TABLE IF NOT EXISTS mensajes (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id  UUID NOT NULL,
      remitente_id     UUID NULL,
      contenido        TEXT NOT NULL,
      tipo             VARCHAR(20) NOT NULL DEFAULT 'texto',
      creado_en        TIMESTAMP DEFAULT now(),
      CONSTRAINT fk_mensaje_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id),
      CONSTRAINT fk_mensaje_remitente    FOREIGN KEY (remitente_id)    REFERENCES usuarios(id) ON DELETE SET NULL
    );
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
