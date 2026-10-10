// Versionado simple del esquema. init.ts (SCHEMA_SQL) es siempre el esquema completo y
// registra todas las versiones; migrate.ts aplica, en orden y de forma idempotente, solo las
// versiones que le faltan a una DB existente.

export interface Migration {
  version: number;
  nombre: string;
  sql: string;
}

export const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Invariante del ledger verificada al COMMIT: por cada pago con movimientos, la retención y la
// suma del desglose igualan pagos.monto_centavos. Los reembolsos quedan fuera del chequeo.
export const LEDGER_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION fn_verificar_ledger_pago() RETURNS trigger AS $fn$
  DECLARE
    v_monto BIGINT;
    v_retencion BIGINT;
    v_suma BIGINT;
  BEGIN
    SELECT monto_centavos INTO v_monto FROM pagos WHERE id = NEW.pago_id;
    SELECT monto_centavos INTO v_retencion
      FROM movimientos WHERE pago_id = NEW.pago_id AND tipo = 'retencion';
    SELECT COALESCE(SUM(monto_centavos), 0) INTO v_suma
      FROM movimientos
      WHERE pago_id = NEW.pago_id
        AND tipo IN ('comision_plataforma', 'regalia_disenador', 'pago_fabricante', 'pago_disenador');
    IF v_retencion IS NULL OR v_retencion <> v_monto OR v_suma <> v_monto THEN
      RAISE EXCEPTION 'Ledger desbalanceado para el pago %: monto=%, retencion=%, desglose=%',
        NEW.pago_id, v_monto, v_retencion, v_suma USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_ledger_balanceado ON movimientos;
  CREATE CONSTRAINT TRIGGER trg_ledger_balanceado
    AFTER INSERT OR UPDATE OF monto_centavos, tipo, pago_id ON movimientos
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.tipo <> 'reembolso')
    EXECUTE FUNCTION fn_verificar_ledger_pago();
`;

// 1 = esquema con ledger de pagos y código de entrega HMAC (anterior al versionado).
// 2 = hardening: uploads, disputas, retención de payouts, cooldown de cuenta, reintentos de
//     webhook, invariantes del ledger. Todas las sentencias son idempotentes.
export const MIGRATIONS: Migration[] = [
  { version: 1, nombre: "esquema_base", sql: "" },
  {
    version: 2,
    nombre: "hardening_uploads_disputas_payouts",
    sql: `
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cuenta_mercadopago_actualizada_en TIMESTAMPTZ NULL;

      CREATE TABLE IF NOT EXISTS uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL,
        usuario_id UUID NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_upload_key UNIQUE (key),
        CONSTRAINT chk_upload_tipo CHECK (tipo IN ('modelo', 'imagen')),
        CONSTRAINT fk_upload_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
      CREATE INDEX IF NOT EXISTS idx_uploads_usuario ON uploads (usuario_id);

      ALTER TABLE ordenes_fabricacion
        ADD COLUMN IF NOT EXISTS confirmada_en TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS disputa_motivo TEXT NULL,
        ADD COLUMN IF NOT EXISTS disputa_abierta_por UUID NULL REFERENCES usuarios(id),
        ADD COLUMN IF NOT EXISTS disputa_abierta_en TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS disputa_resolucion VARCHAR(30) NULL,
        ADD COLUMN IF NOT EXISTS disputa_resuelta_por UUID NULL REFERENCES usuarios(id),
        ADD COLUMN IF NOT EXISTS disputa_resuelta_en TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS disputa_nota TEXT NULL,
        ADD COLUMN IF NOT EXISTS requiere_revision_admin BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS revision_motivo VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS revision_desde TIMESTAMPTZ NULL;

      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS ordenes_fabricacion_estado_check;
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_estado;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_estado
        CHECK (estado IN ('solicitado', 'en_negociacion', 'trato_cerrado', 'confirmada', 'en_disputa', 'rechazado', 'cancelado', 'completado'));
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_resolucion;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_resolucion
        CHECK (disputa_resolucion IS NULL OR disputa_resolucion IN ('liberar_fabricante', 'reembolsar_comprador')) NOT VALID;
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_disputa_abierta;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_disputa_abierta
        CHECK (estado <> 'en_disputa' OR (disputa_motivo IS NOT NULL AND disputa_abierta_por IS NOT NULL)) NOT VALID;
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_disputa_resuelta;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_disputa_resuelta
        CHECK (disputa_resolucion IS NULL OR (disputa_resuelta_por IS NOT NULL AND disputa_resuelta_en IS NOT NULL AND disputa_nota IS NOT NULL)) NOT VALID;
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_precios;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_precios
        CHECK ((precio_propuesto_comprador IS NULL OR precio_propuesto_comprador > 0)
           AND (precio_propuesto_fabricante IS NULL OR precio_propuesto_fabricante > 0)) NOT VALID;
      ALTER TABLE ordenes_fabricacion DROP CONSTRAINT IF EXISTS chk_orden_intentos;
      ALTER TABLE ordenes_fabricacion ADD CONSTRAINT chk_orden_intentos CHECK (intentos_codigo >= 0) NOT VALID;

      DROP INDEX IF EXISTS uq_orden_cerrada_por_compra;
      CREATE UNIQUE INDEX uq_orden_cerrada_por_compra
        ON ordenes_fabricacion (compra_id)
        WHERE estado IN ('trato_cerrado', 'confirmada', 'en_disputa', 'completado');
      CREATE INDEX IF NOT EXISTS idx_ordenes_revision
        ON ordenes_fabricacion (creado_en) WHERE requiere_revision_admin;

      ALTER TABLE pagos
        ADD COLUMN IF NOT EXISTS revision_admin BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS revision_motivo VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS payouts_pagados_al_reembolsar INTEGER NOT NULL DEFAULT 0;
      -- Filas previas al constraint: se completan para que los UPDATE posteriores no lo violen.
      UPDATE pagos SET aprobado_en = COALESCE(aprobado_en, actualizado_en)
        WHERE estado = 'aprobado' AND aprobado_en IS NULL;
      ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_moneda_check;
      ALTER TABLE pagos DROP CONSTRAINT IF EXISTS chk_pago_moneda;
      ALTER TABLE pagos ADD CONSTRAINT chk_pago_moneda CHECK (moneda ~ '^[A-Z]{3}$');
      ALTER TABLE pagos DROP CONSTRAINT IF EXISTS chk_pago_aprobado_en;
      ALTER TABLE pagos ADD CONSTRAINT chk_pago_aprobado_en
        CHECK (estado <> 'aprobado' OR aprobado_en IS NOT NULL) NOT VALID;
      CREATE INDEX IF NOT EXISTS idx_pagos_revision ON pagos (creado_en) WHERE revision_admin;

      ALTER TABLE movimientos
        ADD COLUMN IF NOT EXISTS liberable_desde TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS payout_destino VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS payout_admin_id UUID NULL REFERENCES usuarios(id);
      UPDATE movimientos SET liberable_desde = COALESCE(liberado_en, creado_en)
        WHERE estado = 'pendiente_payout' AND liberable_desde IS NULL;
      UPDATE movimientos SET payout_destino = 'previo_a_auditoria'
        WHERE estado = 'pagado' AND payout_destino IS NULL;
      ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS chk_movimiento_pagado;
      ALTER TABLE movimientos ADD CONSTRAINT chk_movimiento_pagado
        CHECK (estado <> 'pagado' OR (pagado_en IS NOT NULL AND payout_referencia IS NOT NULL AND payout_destino IS NOT NULL)) NOT VALID;
      ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS chk_movimiento_liberable;
      ALTER TABLE movimientos ADD CONSTRAINT chk_movimiento_liberable
        CHECK (estado <> 'pendiente_payout' OR liberable_desde IS NOT NULL) NOT VALID;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_retencion_por_compra
        ON movimientos (compra_id) WHERE tipo = 'retencion';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_compra_fabricante_vigente
        ON ordenes_fabricacion (compra_id, fabricante_id)
        WHERE estado NOT IN ('cancelado', 'rechazado');
      CREATE INDEX IF NOT EXISTS idx_pagos_reembolso_pendiente ON pagos (creado_en) WHERE reembolso_pendiente;
      CREATE INDEX IF NOT EXISTS idx_movimientos_payout_pendiente
        ON movimientos (creado_en) WHERE estado = 'pendiente_payout';

      ALTER TABLE webhook_eventos ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE webhook_eventos DROP CONSTRAINT IF EXISTS webhook_eventos_estado_check;
      ALTER TABLE webhook_eventos DROP CONSTRAINT IF EXISTS chk_webhook_estado;
      ALTER TABLE webhook_eventos ADD CONSTRAINT chk_webhook_estado
        CHECK (estado IN ('procesado', 'ignorado', 'rechazado', 'reintentable'));

      ${LEDGER_TRIGGER_SQL}
    `,
  },
];

export const SCHEMA_VERSION_ACTUAL = MIGRATIONS[MIGRATIONS.length - 1].version;

// Registra todas las versiones como aplicadas (esquema recién creado por init.ts).
export const SCHEMA_VERSIONS_SQL = `
  INSERT INTO schema_migrations (version, nombre) VALUES
    ${MIGRATIONS.map((m) => `(${m.version}, '${m.nombre}')`).join(",\n    ")}
  ON CONFLICT (version) DO NOTHING;
`;
