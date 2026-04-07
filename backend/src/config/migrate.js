require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 1: Tablas base — Usuarios, Roles, Permisos, Sesiones
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Monedas soportadas
DO $$ BEGIN
  CREATE TYPE moneda_tipo AS ENUM ('MXN','USD','USDT','USDC','BTC','ETH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Almacen tipo
DO $$ BEGIN
  CREATE TYPE almacen_tipo AS ENUM ('general_mxn','general_usd','general_rst','folio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Empresa ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresa (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  rfc         VARCHAR(13)  NOT NULL,
  direccion   TEXT,
  telefono    VARCHAR(20),
  email       VARCHAR(100),
  logo_url    VARCHAR(500),
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- ── Unidades de Negocio ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades_negocio (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(10)  UNIQUE NOT NULL,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT TRUE
);

-- ── Roles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(50)  NOT NULL,
  nivel       INTEGER      NOT NULL CHECK (nivel BETWEEN 1 AND 3),
  descripcion TEXT
);

-- ── Departamentos / Organigrama ───────────────────────────────
CREATE TABLE IF NOT EXISTS departamentos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT TRUE
);

-- ── Usuarios ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                  SERIAL PRIMARY KEY,
  nombre              VARCHAR(100) NOT NULL,
  apellidos           VARCHAR(100),
  email               VARCHAR(100) UNIQUE NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  rol_id              INTEGER REFERENCES roles(id),
  unidad_negocio_id   INTEGER REFERENCES unidades_negocio(id),
  departamento_id     INTEGER REFERENCES departamentos(id),
  puesto              VARCHAR(100),
  reporta_a_id        INTEGER REFERENCES usuarios(id),
  nivel_jerarquico    VARCHAR(30) DEFAULT 'Operativo',
  activo              BOOLEAN   DEFAULT TRUE,
  primer_login        BOOLEAN   DEFAULT TRUE,
  ultimo_acceso       TIMESTAMP,
  intentos_fallidos   INTEGER   DEFAULT 0,
  bloqueado_hasta     TIMESTAMP,
  creado_en           TIMESTAMP DEFAULT NOW(),
  actualizado_en      TIMESTAMP DEFAULT NOW()
);

-- ── Permisos por Rol ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permisos (
  id               SERIAL PRIMARY KEY,
  rol_id           INTEGER REFERENCES roles(id),
  modulo           VARCHAR(60) NOT NULL,
  puede_ver        BOOLEAN DEFAULT FALSE,
  puede_crear      BOOLEAN DEFAULT FALSE,
  puede_editar     BOOLEAN DEFAULT FALSE,
  puede_eliminar   BOOLEAN DEFAULT FALSE,
  puede_exportar   BOOLEAN DEFAULT FALSE,
  puede_autorizar  BOOLEAN DEFAULT FALSE
);

-- ── Sesiones / Tokens ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(500),
  expira_en   TIMESTAMP NOT NULL,
  revocado    BOOLEAN   DEFAULT FALSE,
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- ── Refresh Tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  ip_address  VARCHAR(45),
  expira_en   TIMESTAMP NOT NULL,
  usado       BOOLEAN   DEFAULT FALSE,
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- ── Bitácora de Auditoría ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bitacora (
  id               SERIAL PRIMARY KEY,
  usuario_id       INTEGER REFERENCES usuarios(id),
  tabla            VARCHAR(60) NOT NULL,
  registro_id      INTEGER,
  accion           VARCHAR(20) NOT NULL,
  datos_anteriores JSONB,
  datos_nuevos     JSONB,
  ip_address       VARCHAR(45),
  creado_en        TIMESTAMP DEFAULT NOW()
);

-- ── Organigrama ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organigrama (
  id               SERIAL PRIMARY KEY,
  usuario_id       INTEGER REFERENCES usuarios(id),
  nombre           VARCHAR(150) NOT NULL,
  puesto           VARCHAR(150) NOT NULL,
  area             VARCHAR(100),
  reporta_a_nombre VARCHAR(150),
  nivel_jerarquico VARCHAR(30)  DEFAULT 'Operativo',
  rol_erp          VARCHAR(50)  DEFAULT 'Captura',
  unidad           VARCHAR(20)  DEFAULT 'Todas',
  activo           BOOLEAN DEFAULT TRUE,
  orden            INTEGER DEFAULT 0
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol      ON usuarios(rol_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_unidad   ON usuarios(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario  ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira   ON sesiones(expira_en);
CREATE INDEX IF NOT EXISTS idx_permisos_rol      ON permisos(rol_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario  ON bitacora(usuario_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_tabla    ON bitacora(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token     ON refresh_tokens(token_hash);
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 1...');
  try {
    await pool.query(migration);
    logger.info('Migracion completada exitosamente.');
  } catch (err) {
    logger.error('Error en migracion:', err.message);
    throw err;
  }
};

module.exports = runMigration;
