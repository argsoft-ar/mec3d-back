import pool from "../config/db.config";
import { CATALOGO_SEED_SQL } from "./catalogo.seed";
import { guardOrExit } from "./guard";
import {
  LEDGER_TRIGGER_SQL,
  SCHEMA_MIGRATIONS_DDL,
  SCHEMA_VERSIONS_SQL,
} from "./migrations";

// Esquema completo y vigente. Un cambio de esquema se edita acá (para DBs nuevas) y se agrega
// como migración idempotente en migrations.ts (para DBs existentes, ver migrate.ts).

export const RESET_SQL = `
  DROP TABLE IF EXISTS schema_migrations CASCADE;
  DROP TABLE IF EXISTS uploads CASCADE;
  DROP FUNCTION IF EXISTS fn_verificar_ledger_pago() CASCADE;
  DROP TABLE IF EXISTS webhook_eventos CASCADE;
  DROP TABLE IF EXISTS movimientos CASCADE;
  DROP TABLE IF EXISTS pagos CASCADE;
  DROP TABLE IF EXISTS mensajes CASCADE;
  DROP TABLE IF EXISTS conversaciones CASCADE;
  DROP TABLE IF EXISTS ordenes_fabricacion CASCADE;
  DROP TABLE IF EXISTS compras CASCADE;
  DROP TABLE IF EXISTS configuracion_comisiones CASCADE;
  DROP TABLE IF EXISTS productos_fisicos CASCADE;
  DROP TABLE IF EXISTS diseno_materiales CASCADE;
  DROP TABLE IF EXISTS disenos CASCADE;
  DROP TABLE IF EXISTS categorias CASCADE;
  DROP TABLE IF EXISTS fabricante_tecnologias CASCADE;
  DROP TABLE IF EXISTS fabricante_materiales CASCADE;
  DROP TABLE IF EXISTS materiales CASCADE;
  DROP TABLE IF EXISTS tecnologias CASCADE;
  DROP TABLE IF EXISTS usuarios CASCADE;
  DROP TYPE IF EXISTS rol_usuario CASCADE;
  DROP TYPE IF EXISTS estado_producto CASCADE;
`;

export const SCHEMA_SQL = `
  CREATE TYPE rol_usuario AS ENUM ('comprador', 'disenador', 'fabricante', 'admin');

  -- ── Usuarios y catálogo ────────────────────────────────────────────────────
  CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol_principal rol_usuario NOT NULL,
    zona_id INTEGER,
    georef_localidad_id VARCHAR(20),
    puntuacion DECIMAL(3,2) DEFAULT 0.00,
    -- Destino de los payouts a vendedores (ver PayoutProvider); puede estar vacío.
    cuenta_mercadopago VARCHAR(255),
    -- Se actualiza solo cuando la cuenta cambia: habilita el cooldown de payouts (24 h).
    cuenta_mercadopago_actualizada_en TIMESTAMPTZ NULL,
    tagline VARCHAR(255),
    descripcion TEXT,
    experiencia TEXT,
    username VARCHAR(30) UNIQUE,
    telefono VARCHAR(30),
    direccion VARCHAR(255),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_usuarios_rol ON usuarios (rol_principal);
  CREATE INDEX idx_usuarios_zona ON usuarios (zona_id);

  -- Archivos subidos por la plataforma y quién los subió: un diseño solo puede referenciar
  -- uploads propios. key = clave del objeto en R2 (modelo) o public_id de Cloudinary (imagen).
  CREATE TABLE uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    usuario_id UUID NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_upload_key UNIQUE (key),
    CONSTRAINT chk_upload_tipo CHECK (tipo IN ('modelo', 'imagen')),
    CONSTRAINT fk_upload_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
  CREATE INDEX idx_uploads_usuario ON uploads (usuario_id);

  CREATE TABLE tecnologias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
  );

  CREATE TABLE materiales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    tecnologia_id INTEGER NOT NULL,
    CONSTRAINT fk_material_tecnologia FOREIGN KEY (tecnologia_id) REFERENCES tecnologias(id)
  );
  CREATE INDEX idx_materiales_tecnologia ON materiales (tecnologia_id);

  -- material / tecnologia (texto) se conservan por compatibilidad; la referencia
  -- fuerte al catálogo es material_id / tecnologia_id.
  CREATE TABLE fabricante_materiales (
    id SERIAL PRIMARY KEY,
    fabricante_id UUID NOT NULL,
    material VARCHAR(100) NOT NULL,
    material_id INTEGER NOT NULL,
    disponible BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fabricante_mat FOREIGN KEY (fabricante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_fabricante_mat_catalogo FOREIGN KEY (material_id) REFERENCES materiales(id),
    CONSTRAINT uq_fabricante_material UNIQUE (fabricante_id, material),
    CONSTRAINT uq_fabricante_material_id UNIQUE (fabricante_id, material_id)
  );
  CREATE INDEX idx_fabricante_materiales_material ON fabricante_materiales (material_id);

  CREATE TABLE fabricante_tecnologias (
    id SERIAL PRIMARY KEY,
    fabricante_id UUID NOT NULL,
    tecnologia VARCHAR(100) NOT NULL,
    tecnologia_id INTEGER NOT NULL,
    disponible BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fabricante_tec FOREIGN KEY (fabricante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_fabricante_tec_catalogo FOREIGN KEY (tecnologia_id) REFERENCES tecnologias(id),
    CONSTRAINT uq_fabricante_tecnologia UNIQUE (fabricante_id, tecnologia),
    CONSTRAINT uq_fabricante_tecnologia_id UNIQUE (fabricante_id, tecnologia_id)
  );
  CREATE INDEX idx_fabricante_tecnologias_tecnologia ON fabricante_tecnologias (tecnologia_id);

  CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT
  );

  -- ── Diseños ────────────────────────────────────────────────────────────────
  CREATE TABLE disenos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disenador_id UUID NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    categoria_id INTEGER,
    archivo_url TEXT NOT NULL,
    imagen_url TEXT,
    precio_base DECIMAL(10,2) NOT NULL,
    rating DECIMAL(3,2) DEFAULT 0.00,
    review_count INTEGER DEFAULT 0,
    descargas INTEGER DEFAULT 0,
    formato VARCHAR(50),
    especificaciones JSONB,
    tecnologia_id INTEGER NOT NULL,
    -- Soft-delete: las compras referencian el diseño, no se borra físicamente.
    eliminado_en TIMESTAMP NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_disenador FOREIGN KEY (disenador_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
    CONSTRAINT fk_diseno_tecnologia FOREIGN KEY (tecnologia_id) REFERENCES tecnologias(id)
  );
  CREATE INDEX idx_disenos_disenador ON disenos (disenador_id);
  CREATE INDEX idx_disenos_categoria ON disenos (categoria_id);
  CREATE INDEX idx_disenos_tecnologia ON disenos (tecnologia_id);
  CREATE INDEX idx_disenos_activos ON disenos (creado_en DESC) WHERE eliminado_en IS NULL;

  -- Un diseño es compatible con varios materiales, todos de la tecnología del diseño
  -- (esa regla se valida en el service).
  CREATE TABLE diseno_materiales (
    diseno_id UUID NOT NULL,
    material_id INTEGER NOT NULL,
    PRIMARY KEY (diseno_id, material_id),
    CONSTRAINT fk_dm_diseno FOREIGN KEY (diseno_id) REFERENCES disenos(id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_material FOREIGN KEY (material_id) REFERENCES materiales(id)
  );
  CREATE INDEX idx_diseno_materiales_material ON diseno_materiales (material_id);

  -- ── Compras ────────────────────────────────────────────────────────────────
  -- tipo 'descarga': compra del archivo, se paga al crearla (monto = precio_base).
  -- tipo 'fabricacion': ancla de la solicitud de fabricación; el monto se fija al
  -- cerrarse el trato (precio final negociado) y recién entonces se paga.
  -- Estados: pendiente_pago -> pagada -> completada | reembolsada | cancelada.
  -- 'cancelada' con un pago aprobado equivale a "reembolso pendiente" (pagos.reembolso_pendiente).
  -- id_disenador es un snapshot del disenador_id del diseño al momento de la compra.
  CREATE TABLE compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_comprador UUID NOT NULL,
    id_modelo UUID NOT NULL,
    id_disenador UUID NOT NULL,
    material_id INTEGER NULL,
    tipo VARCHAR(20) NOT NULL
      CHECK (tipo IN ('descarga', 'fabricacion')),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente_pago'
      CHECK (estado IN ('pendiente_pago', 'pagada', 'completada', 'reembolsada', 'cancelada')),
    monto_centavos BIGINT NULL
      CHECK (monto_centavos IS NULL OR monto_centavos > 0),
    moneda CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (moneda = 'ARS'),
    fecha TIMESTAMP DEFAULT now(),
    pagada_en TIMESTAMP NULL,
    cancelada_en TIMESTAMP NULL,
    entrega_confirmada BOOLEAN NOT NULL DEFAULT false,
    entregado_en TIMESTAMP NULL,
    fondos_liberados BOOLEAN NOT NULL DEFAULT false,
    fondos_liberados_en TIMESTAMP NULL,
    CONSTRAINT fk_compra_comprador FOREIGN KEY (id_comprador) REFERENCES usuarios(id),
    CONSTRAINT fk_compra_modelo FOREIGN KEY (id_modelo) REFERENCES disenos(id),
    CONSTRAINT fk_compra_disenador FOREIGN KEY (id_disenador) REFERENCES usuarios(id),
    CONSTRAINT fk_compra_material FOREIGN KEY (material_id) REFERENCES materiales(id),
    CONSTRAINT chk_compra_descarga_monto CHECK (tipo <> 'descarga' OR monto_centavos IS NOT NULL),
    CONSTRAINT chk_compra_cobrada_monto
      CHECK (estado NOT IN ('pagada', 'completada', 'reembolsada') OR monto_centavos IS NOT NULL)
  );
  CREATE INDEX idx_compras_comprador ON compras (id_comprador, fecha DESC);
  CREATE INDEX idx_compras_modelo ON compras (id_modelo);
  CREATE INDEX idx_compras_disenador ON compras (id_disenador);
  CREATE INDEX idx_compras_material ON compras (material_id);
  CREATE INDEX idx_compras_estado ON compras (estado);

  -- ── Órdenes de fabricación ─────────────────────────────────────────────────
  -- Una fila por fabricante contactado para una misma compra.
  CREATE TABLE ordenes_fabricacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL,
    fabricante_id UUID NOT NULL,
    -- 'confirmada': el comprador declaró la entrega; falta que el fabricante ingrese el código.
    -- 'en_disputa': el comprador abrió una disputa con la compra pagada; los fondos quedan
    -- congelados hasta que un admin la resuelve.
    estado VARCHAR(20) NOT NULL DEFAULT 'solicitado',
    precio_acordado NUMERIC(12,2) NULL CHECK (precio_acordado IS NULL OR precio_acordado > 0),
    precio_propuesto_comprador NUMERIC(12,2) NULL,
    precio_propuesto_fabricante NUMERIC(12,2) NULL,
    cerrado_por_comprador BOOLEAN DEFAULT false,
    cerrado_por_fabricante BOOLEAN DEFAULT false,
    cerrado_en TIMESTAMP NULL,
    -- Solo se guarda el HMAC-SHA256 (hex) del código de entrega; el código en claro se
    -- entrega al comprador una vez y no es recuperable. intentos_codigo limita los
    -- intentos fallidos del fabricante y se reinicia al generar un código nuevo.
    codigo_entrega_hash VARCHAR(64) NULL,
    codigo_entrega_generado_en TIMESTAMP NULL,
    intentos_codigo INTEGER NOT NULL DEFAULT 0,
    entrega_confirmada BOOLEAN NOT NULL DEFAULT false,
    entregado_en TIMESTAMP NULL,
    creado_en TIMESTAMP DEFAULT now(),
    confirmada_en TIMESTAMPTZ NULL,
    -- Disputa y su resolución por un admin (auditoría: quién, cuándo y por qué).
    disputa_motivo TEXT NULL,
    disputa_abierta_por UUID NULL REFERENCES usuarios(id),
    disputa_abierta_en TIMESTAMPTZ NULL,
    disputa_resolucion VARCHAR(30) NULL,
    disputa_resuelta_por UUID NULL REFERENCES usuarios(id),
    disputa_resuelta_en TIMESTAMPTZ NULL,
    disputa_nota TEXT NULL,
    -- Revisión admin sin disputa (ej. entrega vencida): es un flag, nunca libera fondos solo.
    requiere_revision_admin BOOLEAN NOT NULL DEFAULT false,
    revision_motivo VARCHAR(100) NULL,
    revision_desde TIMESTAMPTZ NULL,
    CONSTRAINT fk_orden_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
    CONSTRAINT fk_orden_fabricante FOREIGN KEY (fabricante_id) REFERENCES usuarios(id),
    CONSTRAINT chk_orden_estado
      CHECK (estado IN ('solicitado', 'en_negociacion', 'trato_cerrado', 'confirmada', 'en_disputa', 'rechazado', 'cancelado', 'completado')),
    CONSTRAINT chk_orden_resolucion
      CHECK (disputa_resolucion IS NULL OR disputa_resolucion IN ('liberar_fabricante', 'reembolsar_comprador')),
    CONSTRAINT chk_orden_disputa_abierta
      CHECK (estado <> 'en_disputa' OR (disputa_motivo IS NOT NULL AND disputa_abierta_por IS NOT NULL)),
    CONSTRAINT chk_orden_disputa_resuelta
      CHECK (disputa_resolucion IS NULL OR (disputa_resuelta_por IS NOT NULL AND disputa_resuelta_en IS NOT NULL AND disputa_nota IS NOT NULL)),
    CONSTRAINT chk_orden_precios
      CHECK ((precio_propuesto_comprador IS NULL OR precio_propuesto_comprador > 0)
         AND (precio_propuesto_fabricante IS NULL OR precio_propuesto_fabricante > 0)),
    CONSTRAINT chk_orden_intentos CHECK (intentos_codigo >= 0)
  );
  CREATE INDEX idx_ordenes_compra ON ordenes_fabricacion (compra_id);
  CREATE INDEX idx_ordenes_fabricante_estado ON ordenes_fabricacion (fabricante_id, estado);
  CREATE INDEX idx_ordenes_estado ON ordenes_fabricacion (estado);
  -- Una compra tiene a lo sumo una orden con trato cerrado (o más avanzada).
  CREATE UNIQUE INDEX uq_orden_cerrada_por_compra
    ON ordenes_fabricacion (compra_id)
    WHERE estado IN ('trato_cerrado', 'confirmada', 'en_disputa', 'completado');
  CREATE INDEX idx_ordenes_revision ON ordenes_fabricacion (creado_en) WHERE requiere_revision_admin;
  -- Un fabricante no puede tener dos órdenes vigentes para la misma compra.
  CREATE UNIQUE INDEX uq_orden_compra_fabricante_vigente
    ON ordenes_fabricacion (compra_id, fabricante_id)
    WHERE estado NOT IN ('cancelado', 'rechazado');

  -- ── Chat ───────────────────────────────────────────────────────────────────
  -- Un chat 1 a 1 por orden de fabricación.
  CREATE TABLE conversaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_fabricacion_id UUID UNIQUE NOT NULL,
    comprador_id UUID NOT NULL,
    fabricante_id UUID NOT NULL,
    creado_en TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_conversacion_orden FOREIGN KEY (orden_fabricacion_id) REFERENCES ordenes_fabricacion(id),
    CONSTRAINT fk_conversacion_comprador FOREIGN KEY (comprador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_conversacion_fabricante FOREIGN KEY (fabricante_id) REFERENCES usuarios(id)
  );
  CREATE INDEX idx_conversaciones_comprador ON conversaciones (comprador_id);
  CREATE INDEX idx_conversaciones_fabricante ON conversaciones (fabricante_id);

  -- remitente_id NULL identifica un mensaje de sistema (ej. "trato cerrado").
  CREATE TABLE mensajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversacion_id UUID NOT NULL,
    remitente_id UUID NULL,
    contenido TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'texto',
    creado_en TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_mensaje_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id),
    CONSTRAINT fk_mensaje_remitente FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_mensajes_conversacion ON mensajes (conversacion_id, creado_en);
  CREATE INDEX idx_mensajes_remitente ON mensajes (remitente_id);

  -- ── Pagos y ledger ─────────────────────────────────────────────────────────
  -- Comisiones en basis points (1000 = 10%). Se leen al aprobarse cada pago.
  CREATE TABLE configuracion_comisiones (
    clave VARCHAR(50) PRIMARY KEY,
    valor_bps INTEGER NOT NULL CHECK (valor_bps BETWEEN 0 AND 10000),
    descripcion TEXT,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Un intento de cobro (preference de Checkout Pro) por fila. monto en centavos.
  CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL,
    orden_id UUID NULL,
    mp_payment_id VARCHAR(40) NULL,
    mp_preference_id VARCHAR(100) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'reembolsado')),
    monto_centavos BIGINT NOT NULL CHECK (monto_centavos > 0),
    -- Un pago aprobado en otra moneda se guarda tal cual para poder reembolsarlo.
    moneda CHAR(3) NOT NULL DEFAULT 'ARS',
    mp_status VARCHAR(30) NULL,
    mp_status_detail VARCHAR(100) NULL,
    -- Respuesta de MP filtrada por allowlist (sin datos del pagador ni de la tarjeta).
    raw JSONB NULL,
    -- true = hay que devolver este pago y el refund en MP todavía no se confirmó.
    reembolso_pendiente BOOLEAN NOT NULL DEFAULT false,
    motivo_reembolso VARCHAR(100) NULL,
    mp_refund_id VARCHAR(40) NULL,
    aprobado_en TIMESTAMPTZ NULL,
    reembolsado_en TIMESTAMPTZ NULL,
    -- Revisión manual de un admin: refund parcial hecho desde el panel de MP o reembolso
    -- de un pago cuyos payouts ya se habían transferido (payouts_pagados_al_reembolsar).
    revision_admin BOOLEAN NOT NULL DEFAULT false,
    revision_motivo VARCHAR(100) NULL,
    payouts_pagados_al_reembolsar INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pago_mp_payment UNIQUE (mp_payment_id),
    CONSTRAINT fk_pago_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
    CONSTRAINT fk_pago_orden FOREIGN KEY (orden_id) REFERENCES ordenes_fabricacion(id),
    CONSTRAINT chk_pago_moneda CHECK (moneda ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_pago_aprobado_en CHECK (estado <> 'aprobado' OR aprobado_en IS NOT NULL)
  );
  CREATE INDEX idx_pagos_compra ON pagos (compra_id);
  CREATE INDEX idx_pagos_orden ON pagos (orden_id);
  CREATE INDEX idx_pagos_estado ON pagos (estado);
  CREATE INDEX idx_pagos_preference ON pagos (mp_preference_id);
  CREATE INDEX idx_pagos_reembolso_pendiente ON pagos (creado_en) WHERE reembolso_pendiente;
  CREATE INDEX idx_pagos_revision ON pagos (creado_en) WHERE revision_admin;

  -- Ledger interno: fuente de verdad del escrow.
  -- Por cada pago aprobado: una 'retencion' por el total + el desglose
  -- (comision_plataforma, regalia_disenador, pago_fabricante / pago_disenador) cuya suma
  -- es exactamente pagos.monto_centavos (se verifica en código y en tests). usuario_id NULL
  -- identifica a la plataforma. 'reembolso' es la devolución al comprador.
  CREATE TABLE movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pago_id UUID NOT NULL,
    compra_id UUID NOT NULL,
    orden_id UUID NULL,
    usuario_id UUID NULL,
    tipo VARCHAR(30) NOT NULL
      CHECK (tipo IN ('retencion', 'comision_plataforma', 'regalia_disenador', 'pago_fabricante', 'pago_disenador', 'reembolso')),
    monto_centavos BIGINT NOT NULL CHECK (monto_centavos > 0),
    estado VARCHAR(20) NOT NULL
      CHECK (estado IN ('retenido', 'liberado', 'pendiente_payout', 'pagado', 'reembolsado')),
    payout_referencia VARCHAR(255) NULL,
    -- Cuenta destino y admin que registró la transferencia (auditoría del payout manual).
    payout_destino VARCHAR(255) NULL,
    payout_admin_id UUID NULL REFERENCES usuarios(id),
    liberado_en TIMESTAMPTZ NULL,
    -- Un payout 'pendiente_payout' solo puede pagarse desde esta fecha (retención de descargas).
    liberable_desde TIMESTAMPTZ NULL,
    pagado_en TIMESTAMPTZ NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_mov_pago FOREIGN KEY (pago_id) REFERENCES pagos(id),
    CONSTRAINT fk_mov_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
    CONSTRAINT fk_mov_orden FOREIGN KEY (orden_id) REFERENCES ordenes_fabricacion(id),
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    -- Un movimiento de cada tipo por pago: hace idempotente la escritura del ledger.
    CONSTRAINT uq_movimiento_pago_tipo UNIQUE (pago_id, tipo),
    CONSTRAINT chk_movimiento_usuario
      CHECK ((tipo IN ('retencion', 'comision_plataforma')) = (usuario_id IS NULL)),
    CONSTRAINT chk_movimiento_pagado
      CHECK (estado <> 'pagado' OR (pagado_en IS NOT NULL AND payout_referencia IS NOT NULL AND payout_destino IS NOT NULL)),
    CONSTRAINT chk_movimiento_liberable
      CHECK (estado <> 'pendiente_payout' OR liberable_desde IS NOT NULL)
  );
  -- A lo sumo una retención por compra (un solo pago respalda el escrow).
  CREATE UNIQUE INDEX uq_retencion_por_compra ON movimientos (compra_id) WHERE tipo = 'retencion';
  CREATE INDEX idx_movimientos_compra ON movimientos (compra_id);
  CREATE INDEX idx_movimientos_orden ON movimientos (orden_id);
  CREATE INDEX idx_movimientos_usuario_estado ON movimientos (usuario_id, estado);
  CREATE INDEX idx_movimientos_usuario_fecha ON movimientos (usuario_id, creado_en DESC);
  CREATE INDEX idx_movimientos_payout_pendiente ON movimientos (creado_en) WHERE estado = 'pendiente_payout';

  ${LEDGER_TRIGGER_SQL}

  -- Idempotencia y auditoría de webhooks. evento_id se deriva de data.id + x-request-id
  -- (firmados); 'pendiente:<data.id>' cuenta los reintentos cuando MP aún no expone el pago.
  -- estado 'reintentable' = se respondió 503 para que MP reintente.
  CREATE TABLE webhook_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NULL,
    accion VARCHAR(50) NULL,
    data_id VARCHAR(100) NULL,
    request_id VARCHAR(100) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'procesado',
    detalle TEXT NULL,
    payload JSONB NULL,
    intentos INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_webhook_evento UNIQUE (evento_id),
    CONSTRAINT chk_webhook_estado CHECK (estado IN ('procesado', 'ignorado', 'rechazado', 'reintentable'))
  );
  CREATE INDEX idx_webhook_eventos_data ON webhook_eventos (data_id);

  ${SCHEMA_MIGRATIONS_DDL}
  ${SCHEMA_VERSIONS_SQL}
`;

// Datos de referencia idempotentes: los necesita la app para funcionar (catálogo,
// categorías y comisiones). También los reaplican seed.ts, truncate.ts y migrate.ts.
export const REFERENCE_DATA_SQL = `
  ${CATALOGO_SEED_SQL}

  INSERT INTO categorias (nombre, descripcion) VALUES
    ('Autos', 'Piezas y repuestos para automóviles'),
    ('Motos', 'Componentes y accesorios para motos'),
    ('Barcos', 'Partes náuticas y marinas'),
    ('Casa', 'Herrajes, cerraduras y más'),
    ('Maquinas', 'Piezas industriales y de producción'),
    ('Engranajes', 'Transmisiones, poleas y sistemas mecánicos')
  ON CONFLICT (nombre) DO NOTHING;

  INSERT INTO configuracion_comisiones (clave, valor_bps, descripcion) VALUES
    ('plataforma', 1000, 'Comisión de la plataforma sobre cada cobro (compra de diseño o fabricación), en basis points'),
    ('regalia_disenador', 300, 'Regalía del diseñador sobre la ganancia bruta del fabricante (monto menos comisión de plataforma), en basis points')
  ON CONFLICT (clave) DO NOTHING;
`;

const initDatabase = async () => {
  guardOrExit("db:init");
  let failed = false;
  try {
    console.log("🔄 Borrando base de datos antigua y recreando el esquema...");
    const client = await pool.connect();
    try {
      // El DDL completo puede superar el statement_timeout de runtime.
      await client.query("SET statement_timeout = 0");
      // Un único string multi-statement: PostgreSQL lo ejecuta como una transacción implícita.
      await client.query(RESET_SQL + SCHEMA_SQL + REFERENCE_DATA_SQL);
    } finally {
      client.release();
    }
    console.log("✅ Esquema inicializado con éxito");
  } catch (error) {
    console.error("❌ Error inicializando base de datos:", error);
    failed = true;
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
};

if (require.main === module) {
  void initDatabase();
}
