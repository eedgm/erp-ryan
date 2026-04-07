require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 2: Catálogos Base
-- Clientes, Proveedores, Productos/Servicios,
-- Cuentas Bancarias, Carteras Cripto, Tipos de Cambio
-- ============================================================

-- Tipos ENUM (solo si no existen del Sprint 1)
DO $$ BEGIN
  CREATE TYPE moneda_tipo AS ENUM ('MXN','USD','USDT','USDC','BTC','ETH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tipos de Cambio ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tipos_cambio (
  id              SERIAL PRIMARY KEY,
  fecha           DATE        NOT NULL,
  moneda          moneda_tipo NOT NULL,
  a_mxn           DECIMAL(18,8) NOT NULL,
  a_usd           DECIMAL(18,8),
  fuente          VARCHAR(50) DEFAULT 'Manual',
  registrado_por  INTEGER REFERENCES usuarios(id),
  creado_en       TIMESTAMP DEFAULT NOW(),
  UNIQUE(fecha, moneda)
);

-- ── Clientes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                SERIAL PRIMARY KEY,
  codigo            VARCHAR(20)  UNIQUE,
  nombre            VARCHAR(200) NOT NULL,
  rfc               VARCHAR(13),
  tipo              VARCHAR(20)  DEFAULT 'Empresa',
  sector            VARCHAR(60),
  direccion         TEXT,
  ciudad            VARCHAR(100),
  estado_geo        VARCHAR(100),
  pais              VARCHAR(50)  DEFAULT 'Mexico',
  codigo_postal     VARCHAR(10),
  telefono          VARCHAR(20),
  email             VARCHAR(100),
  sitio_web         VARCHAR(200),
  contacto_nombre   VARCHAR(100),
  contacto_email    VARCHAR(100),
  contacto_tel      VARCHAR(20),
  contacto_puesto   VARCHAR(100),
  moneda_preferida  moneda_tipo  DEFAULT 'MXN',
  credito_limite    DECIMAL(15,2) DEFAULT 0,
  credito_dias      INTEGER      DEFAULT 30,
  unidad_negocio_id INTEGER REFERENCES unidades_negocio(id),
  activo            BOOLEAN DEFAULT TRUE,
  notas             TEXT,
  creado_en         TIMESTAMP DEFAULT NOW(),
  creado_por        INTEGER REFERENCES usuarios(id),
  actualizado_en    TIMESTAMP DEFAULT NOW()
);

-- ── Proveedores ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
  id                SERIAL PRIMARY KEY,
  codigo            VARCHAR(20)  UNIQUE,
  nombre            VARCHAR(200) NOT NULL,
  rfc               VARCHAR(13),
  tipo              VARCHAR(20)  DEFAULT 'Empresa',
  giro              VARCHAR(100),
  direccion         TEXT,
  ciudad            VARCHAR(100),
  estado_geo        VARCHAR(100),
  pais              VARCHAR(50)  DEFAULT 'Mexico',
  codigo_postal     VARCHAR(10),
  telefono          VARCHAR(20),
  email             VARCHAR(100),
  email_compras     VARCHAR(100),
  sitio_web         VARCHAR(200),
  contacto_nombre   VARCHAR(100),
  contacto_email    VARCHAR(100),
  contacto_tel      VARCHAR(20),
  moneda_preferida  moneda_tipo  DEFAULT 'MXN',
  dias_credito      INTEGER      DEFAULT 30,
  wallet_cripto     VARCHAR(300),
  red_cripto        VARCHAR(50),
  banco             VARCHAR(100),
  cuenta_clabe      VARCHAR(18),
  activo            BOOLEAN DEFAULT TRUE,
  es_proveedor_rst  BOOLEAN DEFAULT FALSE,
  notas             TEXT,
  creado_en         TIMESTAMP DEFAULT NOW(),
  creado_por        INTEGER REFERENCES usuarios(id),
  actualizado_en    TIMESTAMP DEFAULT NOW()
);

-- ── Categorías de Productos ───────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias_producto (
  id        SERIAL PRIMARY KEY,
  nombre    VARCHAR(100) NOT NULL,
  tipo      VARCHAR(20)  NOT NULL CHECK (tipo IN ('Servicio','Suministro','Equipo','Herramienta')),
  padre_id  INTEGER REFERENCES categorias_producto(id),
  activo    BOOLEAN DEFAULT TRUE
);

-- ── Productos y Servicios ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos_servicios (
  id                    SERIAL PRIMARY KEY,
  codigo                VARCHAR(30) UNIQUE,
  nombre                VARCHAR(200) NOT NULL,
  descripcion           TEXT,
  tipo                  VARCHAR(20) NOT NULL CHECK (tipo IN ('Servicio','Suministro','Equipo','Herramienta')),
  categoria_id          INTEGER REFERENCES categorias_producto(id),
  unidad_medida         VARCHAR(20),
  precio_venta_mxn      DECIMAL(15,4),
  precio_venta_usd      DECIMAL(15,4),
  costo_mxn             DECIMAL(15,4),
  costo_usd             DECIMAL(15,4),
  aplica_iva            BOOLEAN DEFAULT TRUE,
  tasa_iva              DECIMAL(5,2) DEFAULT 16.00,
  controla_inventario   BOOLEAN DEFAULT FALSE,
  stock_minimo          DECIMAL(12,2) DEFAULT 0,
  es_producto_rst       BOOLEAN DEFAULT FALSE,
  proveedor_preferido_id INTEGER REFERENCES proveedores(id),
  activo                BOOLEAN DEFAULT TRUE,
  notas                 TEXT,
  creado_en             TIMESTAMP DEFAULT NOW(),
  creado_por            INTEGER REFERENCES usuarios(id)
);

-- ── Cuentas Bancarias ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id                SERIAL PRIMARY KEY,
  banco             VARCHAR(100) NOT NULL,
  nombre_cuenta     VARCHAR(100) NOT NULL,
  numero_cuenta     VARCHAR(30),
  clabe             VARCHAR(18),
  moneda            moneda_tipo  DEFAULT 'MXN',
  saldo_inicial     DECIMAL(15,2) DEFAULT 0,
  unidad_negocio_id INTEGER REFERENCES unidades_negocio(id),
  activo            BOOLEAN DEFAULT TRUE,
  notas             TEXT,
  creado_en         TIMESTAMP DEFAULT NOW()
);

-- ── Carteras Cripto ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carteras_cripto (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  moneda            moneda_tipo  NOT NULL CHECK (moneda IN ('USDT','USDC','BTC','ETH')),
  direccion_wallet  VARCHAR(300),
  red               VARCHAR(50),
  exchange          VARCHAR(50)  DEFAULT 'Binance',
  saldo_inicial     DECIMAL(18,8) DEFAULT 0,
  unidad_negocio_id INTEGER REFERENCES unidades_negocio(id),
  activo            BOOLEAN DEFAULT TRUE,
  notas             TEXT,
  creado_en         TIMESTAMP DEFAULT NOW()
);

-- ── Familias de Presupuesto (catalogo) ────────────────────────
CREATE TABLE IF NOT EXISTS familias_presupuesto_catalogo (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden       INTEGER DEFAULT 0,
  activo      BOOLEAN DEFAULT TRUE
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_nombre      ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_rfc         ON clientes(rfc);
CREATE INDEX IF NOT EXISTS idx_clientes_unidad      ON clientes(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_clientes_activo      ON clientes(activo);
CREATE INDEX IF NOT EXISTS idx_proveedores_nombre   ON proveedores(nombre);
CREATE INDEX IF NOT EXISTS idx_proveedores_rfc      ON proveedores(rfc);
CREATE INDEX IF NOT EXISTS idx_proveedores_activo   ON proveedores(activo);
CREATE INDEX IF NOT EXISTS idx_productos_codigo     ON productos_servicios(codigo);
CREATE INDEX IF NOT EXISTS idx_productos_tipo       ON productos_servicios(tipo);
CREATE INDEX IF NOT EXISTS idx_productos_activo     ON productos_servicios(activo);
CREATE INDEX IF NOT EXISTS idx_productos_rst        ON productos_servicios(es_producto_rst);
CREATE INDEX IF NOT EXISTS idx_tc_fecha_moneda      ON tipos_cambio(fecha, moneda);
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 2 — Catalogos...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 2 completada exitosamente.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 2:', err.message);
    throw err;
  }
};

module.exports = runMigration;
