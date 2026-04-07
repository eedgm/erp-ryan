require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 5: Órdenes de Compra
-- ordenes_compra, oc_partidas, oc_recepciones,
-- requisiciones, pagos_proveedor
-- ============================================================

DO $$ BEGIN
  CREATE TYPE oc_estado AS ENUM (
    'borrador','en_revision','autorizada','enviada_proveedor',
    'recibida_parcial','recibida_total','cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oc_accion_stock AS ENUM (
    'de_almacen','comprar','mixto','sin_stock_verificado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Órdenes de Compra ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id                  SERIAL PRIMARY KEY,
  folio               VARCHAR(30)   UNIQUE NOT NULL,
  proyecto_id         INTEGER       REFERENCES proyectos(id),
  unidad_negocio_id   INTEGER       REFERENCES unidades_negocio(id),
  proveedor_id        INTEGER       REFERENCES proveedores(id),
  solicitante_id      INTEGER       REFERENCES usuarios(id),
  fecha_solicitud     DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_necesidad     DATE,
  moneda              moneda_tipo   DEFAULT 'MXN',
  tipo_cambio         DECIMAL(18,8) DEFAULT 1,
  subtotal            DECIMAL(15,2) DEFAULT 0,
  iva                 DECIMAL(15,2) DEFAULT 0,
  total               DECIMAL(15,2) DEFAULT 0,
  total_mxn           DECIMAL(15,2) DEFAULT 0,
  estado              oc_estado     DEFAULT 'borrador',
  -- Email
  email_enviado_a     VARCHAR(300),
  fecha_envio_email   TIMESTAMP,
  email_asunto        VARCHAR(300),
  -- Autorización
  autorizado_por      INTEGER       REFERENCES usuarios(id),
  fecha_autorizacion  TIMESTAMP,
  -- Notas
  condiciones_pago    VARCHAR(200),
  lugar_entrega       TEXT,
  notas               TEXT,
  -- Auditoría
  creado_en           TIMESTAMP     DEFAULT NOW(),
  creado_por          INTEGER       REFERENCES usuarios(id),
  actualizado_en      TIMESTAMP     DEFAULT NOW()
);

-- ── Partidas de OC ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_partidas (
  id                    SERIAL PRIMARY KEY,
  orden_compra_id       INTEGER       NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  numero_partida        INTEGER       NOT NULL,
  producto_id           INTEGER       REFERENCES productos_servicios(id),
  descripcion           VARCHAR(300)  NOT NULL,
  unidad_medida         VARCHAR(20),
  cantidad_solicitada   DECIMAL(14,4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_recibida     DECIMAL(14,4) DEFAULT 0,
  precio_unitario       DECIMAL(15,4) DEFAULT 0,
  descuento_pct         DECIMAL(5,2)  DEFAULT 0,
  subtotal              DECIMAL(15,2) DEFAULT 0,
  aplica_iva            BOOLEAN       DEFAULT TRUE,
  tasa_iva              DECIMAL(5,2)  DEFAULT 16,
  iva                   DECIMAL(15,2) DEFAULT 0,
  total                 DECIMAL(15,2) DEFAULT 0,
  -- Verificación de stock (se llena al crear la OC)
  stock_verificado      DECIMAL(14,4) DEFAULT 0,
  almacen_con_stock_id  INTEGER       REFERENCES almacenes(id),
  accion_sugerida       oc_accion_stock DEFAULT 'sin_stock_verificado',
  cantidad_de_almacen   DECIMAL(14,4) DEFAULT 0,
  cantidad_a_comprar    DECIMAL(14,4) DEFAULT 0,
  -- Estado de la partida
  estado_partida        VARCHAR(20)   DEFAULT 'pendiente'
                        CHECK (estado_partida IN ('pendiente','parcial','completo','cancelado'))
);

-- ── Recepciones de OC ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_recepciones (
  id                  SERIAL PRIMARY KEY,
  orden_compra_id     INTEGER       NOT NULL REFERENCES ordenes_compra(id),
  oc_partida_id       INTEGER       NOT NULL REFERENCES oc_partidas(id),
  fecha_recepcion     DATE          NOT NULL DEFAULT CURRENT_DATE,
  cantidad_recibida   DECIMAL(14,4) NOT NULL CHECK (cantidad_recibida > 0),
  costo_unitario_real DECIMAL(15,4),
  almacen_destino_id  INTEGER       REFERENCES almacenes(id),
  numero_remision     VARCHAR(80),
  numero_factura      VARCHAR(80),
  notas               TEXT,
  recibido_por        INTEGER       REFERENCES usuarios(id),
  creado_en           TIMESTAMP     DEFAULT NOW()
);

-- ── Requisiciones (para área de compras) ─────────────────────
CREATE TABLE IF NOT EXISTS requisiciones (
  id                    SERIAL PRIMARY KEY,
  folio                 VARCHAR(30)   UNIQUE NOT NULL,
  orden_compra_id       INTEGER       REFERENCES ordenes_compra(id),
  oc_partida_id         INTEGER       REFERENCES oc_partidas(id),
  proyecto_id           INTEGER       REFERENCES proyectos(id),
  unidad_negocio_id     INTEGER       REFERENCES unidades_negocio(id),
  proveedor_id          INTEGER       REFERENCES proveedores(id),
  producto_id           INTEGER       REFERENCES productos_servicios(id),
  descripcion           VARCHAR(300),
  cantidad              DECIMAL(14,4) NOT NULL,
  unidad_medida         VARCHAR(20),
  fecha_requerida       DATE,
  -- Pago programado
  monto_estimado        DECIMAL(15,2) DEFAULT 0,
  moneda                moneda_tipo   DEFAULT 'MXN',
  fecha_pago_programada DATE,
  -- Estado
  estado                VARCHAR(30)   DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','en_proceso','surtida_parcial','surtida_total','cancelada')),
  notas                 TEXT,
  creado_por            INTEGER       REFERENCES usuarios(id),
  creado_en             TIMESTAMP     DEFAULT NOW(),
  actualizado_en        TIMESTAMP     DEFAULT NOW()
);

-- ── Pagos a Proveedor ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id                  SERIAL PRIMARY KEY,
  requisicion_id      INTEGER       REFERENCES requisiciones(id),
  orden_compra_id     INTEGER       REFERENCES ordenes_compra(id),
  proveedor_id        INTEGER       REFERENCES proveedores(id),
  fecha_pago          DATE          NOT NULL,
  monto               DECIMAL(15,2) NOT NULL,
  moneda              moneda_tipo   DEFAULT 'MXN',
  tipo_cambio         DECIMAL(18,8) DEFAULT 1,
  monto_mxn           DECIMAL(15,2),
  forma_pago          VARCHAR(40),
  cuenta_bancaria_id  INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id   INTEGER       REFERENCES carteras_cripto(id),
  referencia          VARCHAR(100),
  hash_cripto         VARCHAR(200),
  notas               TEXT,
  registrado_por      INTEGER       REFERENCES usuarios(id),
  creado_en           TIMESTAMP     DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oc_proyecto      ON ordenes_compra(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_oc_proveedor     ON ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_estado        ON ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_oc_unidad        ON ordenes_compra(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_oc_partidas_oc   ON oc_partidas(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_oc_rec_partida   ON oc_recepciones(oc_partida_id);
CREATE INDEX IF NOT EXISTS idx_req_estado       ON requisiciones(estado);
CREATE INDEX IF NOT EXISTS idx_req_proyecto     ON requisiciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_req_fecha_pago   ON requisiciones(fecha_pago_programada);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedor  ON pagos_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha      ON pagos_proveedor(fecha_pago);
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 5 — Ordenes de Compra...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 5 completada.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 5:', err.message);
    throw err;
  }
};

module.exports = runMigration;
