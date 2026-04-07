require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 3: Folios de Proyectos
-- proyectos, proyecto_presupuesto_familias,
-- proyecto_estados_log, proyecto_documentos
-- ============================================================

-- Enum de estado de proyecto
DO $$ BEGIN
  CREATE TYPE proyecto_estado AS ENUM
    ('Activo','Pausado','Cerrado','Cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum tipo de proyecto
DO $$ BEGIN
  CREATE TYPE proyecto_tipo AS ENUM
    ('Proyecto','Contrato','Servicio','Orden de Trabajo','Mantenimiento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Proyectos / Folios ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proyectos (
  id                    SERIAL PRIMARY KEY,
  folio                 VARCHAR(30)    UNIQUE NOT NULL,
  nombre                VARCHAR(200)   NOT NULL,
  descripcion           TEXT,
  cliente_id            INTEGER        REFERENCES clientes(id),
  unidad_negocio_id     INTEGER        NOT NULL REFERENCES unidades_negocio(id),
  tipo                  proyecto_tipo  DEFAULT 'Proyecto',
  moneda                moneda_tipo    DEFAULT 'MXN',
  tipo_cambio_inicial   DECIMAL(18,8)  DEFAULT 1,
  -- Presupuesto
  presupuesto_global    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  presupuesto_global_mxn DECIMAL(15,2) DEFAULT 0,
  -- Fechas
  fecha_inicio          DATE,
  fecha_fin_estimada    DATE,
  fecha_fin_real        DATE,
  -- Estado
  estado                proyecto_estado DEFAULT 'Activo',
  avance_porcentaje     DECIMAL(5,2)   DEFAULT 0
                        CHECK (avance_porcentaje BETWEEN 0 AND 100),
  -- Almacén propio
  tiene_almacen         BOOLEAN        DEFAULT FALSE,
  almacen_id            INTEGER,       -- FK a almacenes (se asigna al crear)
  -- Responsable
  responsable_id        INTEGER        REFERENCES usuarios(id),
  -- Control
  cerrado_en            TIMESTAMP,
  cerrado_por           INTEGER        REFERENCES usuarios(id),
  notas                 TEXT,
  creado_en             TIMESTAMP      DEFAULT NOW(),
  creado_por            INTEGER        REFERENCES usuarios(id),
  actualizado_en        TIMESTAMP      DEFAULT NOW(),
  actualizado_por       INTEGER        REFERENCES usuarios(id)
);

-- ── Presupuesto por Familias ──────────────────────────────────
CREATE TABLE IF NOT EXISTS proyecto_presupuesto_familias (
  id            SERIAL PRIMARY KEY,
  proyecto_id   INTEGER       NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  familia_id    INTEGER       REFERENCES familias_presupuesto_catalogo(id),
  nombre_familia VARCHAR(100) NOT NULL,
  presupuesto   DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (presupuesto >= 0),
  consumido     DECIMAL(15,2) DEFAULT 0,           -- Actualizado en tiempo real al registrar gastos
  reservado     DECIMAL(15,2) DEFAULT 0,           -- OC aprobadas pendientes de recibir
  UNIQUE(proyecto_id, familia_id)
);

-- ── Log de Cambios de Estado ──────────────────────────────────
CREATE TABLE IF NOT EXISTS proyecto_estados_log (
  id           SERIAL PRIMARY KEY,
  proyecto_id  INTEGER         NOT NULL REFERENCES proyectos(id),
  estado_antes proyecto_estado,
  estado_nuevo proyecto_estado NOT NULL,
  motivo       TEXT,
  usuario_id   INTEGER         REFERENCES usuarios(id),
  creado_en    TIMESTAMP       DEFAULT NOW()
);

-- ── Documentos adjuntos al proyecto ──────────────────────────
CREATE TABLE IF NOT EXISTS proyecto_documentos (
  id           SERIAL PRIMARY KEY,
  proyecto_id  INTEGER      NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre       VARCHAR(200) NOT NULL,
  tipo         VARCHAR(50),                -- 'Contrato','Plano','Memoria','Otro'
  url          VARCHAR(500),
  tamanio_kb   INTEGER,
  subido_por   INTEGER      REFERENCES usuarios(id),
  creado_en    TIMESTAMP    DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_proyectos_folio       ON proyectos(folio);
CREATE INDEX IF NOT EXISTS idx_proyectos_unidad      ON proyectos(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_cliente     ON proyectos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_estado      ON proyectos(estado);
CREATE INDEX IF NOT EXISTS idx_proyectos_responsable ON proyectos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_ppto_familias_proy    ON proyecto_presupuesto_familias(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_estados_log_proy      ON proyecto_estados_log(proyecto_id);

-- ── Función: actualizar consumido de familia ──────────────────
-- Se llama desde gastos al registrar/modificar un gasto de proyecto
CREATE OR REPLACE FUNCTION actualizar_consumido_familia(
  p_proyecto_id INTEGER,
  p_familia_id  INTEGER
) RETURNS void AS $$
BEGIN
  UPDATE proyecto_presupuesto_familias
  SET consumido = (
    SELECT COALESCE(SUM(g.total_mxn), 0)
    FROM gastos g
    WHERE g.proyecto_id = p_proyecto_id
      AND g.familia_presupuesto_id = p_familia_id
  )
  WHERE proyecto_id = p_proyecto_id
    AND familia_id  = p_familia_id;
END;
$$ LANGUAGE plpgsql;

-- ── Función: recalcular todo el presupuesto de un proyecto ────
CREATE OR REPLACE FUNCTION recalcular_presupuesto_proyecto(p_proyecto_id INTEGER)
RETURNS void AS $$
DECLARE
  fam RECORD;
BEGIN
  FOR fam IN
    SELECT familia_id FROM proyecto_presupuesto_familias
    WHERE proyecto_id = p_proyecto_id
  LOOP
    PERFORM actualizar_consumido_familia(p_proyecto_id, fam.familia_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 3 — Proyectos...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 3 completada.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 3:', err.message);
    throw err;
  }
};

module.exports = runMigration;
