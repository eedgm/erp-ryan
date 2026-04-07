require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 4: Almacenes e Inventario
-- almacenes, inventario, movimientos_inventario,
-- importaciones_csv, traspasos
-- ============================================================

DO $$ BEGIN
  CREATE TYPE almacen_tipo AS ENUM
    ('general_mxn','general_usd','general_rst','folio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movimiento_tipo AS ENUM (
    'entrada','salida','traspaso_salida','traspaso_entrada',
    'ajuste_positivo','ajuste_negativo','devolucion','importacion_csv'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Almacenes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS almacenes (
  id                SERIAL PRIMARY KEY,
  clave             VARCHAR(40)   UNIQUE NOT NULL,
  nombre            VARCHAR(150)  NOT NULL,
  tipo              almacen_tipo  NOT NULL,
  moneda_valuacion  moneda_tipo   DEFAULT 'MXN',
  ubicacion         VARCHAR(200),
  unidad_negocio_id INTEGER       REFERENCES unidades_negocio(id),
  proyecto_id       INTEGER       REFERENCES proyectos(id),
  activo            BOOLEAN       DEFAULT TRUE,
  notas             TEXT,
  creado_en         TIMESTAMP     DEFAULT NOW(),
  creado_por        INTEGER       REFERENCES usuarios(id)
);

-- ── Inventario (stock actual por producto+almacen) ────────────
CREATE TABLE IF NOT EXISTS inventario (
  id                    SERIAL PRIMARY KEY,
  producto_id           INTEGER       NOT NULL REFERENCES productos_servicios(id),
  almacen_id            INTEGER       NOT NULL REFERENCES almacenes(id),
  stock_actual          DECIMAL(14,4) NOT NULL DEFAULT 0,
  costo_promedio        DECIMAL(15,4) DEFAULT 0,
  costo_moneda          moneda_tipo   DEFAULT 'MXN',
  costo_promedio_mxn    DECIMAL(15,4) DEFAULT 0,   -- Siempre en MXN para reportes
  ultima_actualizacion  TIMESTAMP     DEFAULT NOW(),
  UNIQUE(producto_id, almacen_id)
);

-- ── Movimientos de Inventario ─────────────────────────────────
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id                  SERIAL PRIMARY KEY,
  producto_id         INTEGER          NOT NULL REFERENCES productos_servicios(id),
  almacen_origen_id   INTEGER          REFERENCES almacenes(id),
  almacen_destino_id  INTEGER          REFERENCES almacenes(id),
  tipo                movimiento_tipo  NOT NULL,
  cantidad            DECIMAL(14,4)    NOT NULL CHECK (cantidad > 0),
  costo_unitario      DECIMAL(15,4),
  costo_moneda        moneda_tipo      DEFAULT 'MXN',
  tipo_cambio         DECIMAL(18,8)    DEFAULT 1,
  costo_unitario_mxn  DECIMAL(15,4),
  costo_total_mxn     DECIMAL(15,2),
  proyecto_id         INTEGER          REFERENCES proyectos(id),
  orden_trabajo_id    INTEGER,
  orden_compra_id     INTEGER,
  importacion_id      INTEGER,
  referencia          VARCHAR(100),
  notas               TEXT,
  fecha               DATE             NOT NULL,
  creado_por          INTEGER          REFERENCES usuarios(id),
  creado_en           TIMESTAMP        DEFAULT NOW()
);

-- ── Importaciones CSV ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS importaciones_csv (
  id                SERIAL PRIMARY KEY,
  almacen_id        INTEGER       NOT NULL REFERENCES almacenes(id),
  nombre_archivo    VARCHAR(200),
  modo              VARCHAR(20)   NOT NULL CHECK (modo IN ('reemplazar','agregar')),
  total_filas       INTEGER       DEFAULT 0,
  filas_importadas  INTEGER       DEFAULT 0,
  filas_con_error   INTEGER       DEFAULT 0,
  errores           JSONB,
  mapeo_columnas    JSONB,
  importado_por     INTEGER       REFERENCES usuarios(id),
  creado_en         TIMESTAMP     DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_almacenes_tipo       ON almacenes(tipo);
CREATE INDEX IF NOT EXISTS idx_almacenes_proyecto   ON almacenes(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_almacenes_unidad     ON almacenes(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_inventario_almacen   ON inventario(almacen_id);
CREATE INDEX IF NOT EXISTS idx_inventario_producto  ON inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_origen           ON movimientos_inventario(almacen_origen_id);
CREATE INDEX IF NOT EXISTS idx_mov_destino          ON movimientos_inventario(almacen_destino_id);
CREATE INDEX IF NOT EXISTS idx_mov_fecha            ON movimientos_inventario(fecha);
CREATE INDEX IF NOT EXISTS idx_mov_producto         ON movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_proyecto         ON movimientos_inventario(proyecto_id);

-- ── Función: recalcular stock y costo promedio ────────────────
CREATE OR REPLACE FUNCTION recalcular_stock(
  p_producto_id INTEGER,
  p_almacen_id  INTEGER
) RETURNS void AS $$
DECLARE
  v_stock         DECIMAL(14,4);
  v_costo_prom    DECIMAL(15,4);
  v_costo_prom_mxn DECIMAL(15,4);
BEGIN
  -- Calcular stock neto desde movimientos
  SELECT
    COALESCE(SUM(CASE
      WHEN tipo IN ('entrada','traspaso_entrada','ajuste_positivo','importacion_csv','devolucion')
        THEN cantidad
      WHEN tipo IN ('salida','traspaso_salida','ajuste_negativo')
        THEN -cantidad
      ELSE 0
    END), 0),
    COALESCE(AVG(costo_unitario) FILTER (
      WHERE tipo IN ('entrada','importacion_csv') AND costo_unitario IS NOT NULL
    ), 0),
    COALESCE(AVG(costo_unitario_mxn) FILTER (
      WHERE tipo IN ('entrada','importacion_csv') AND costo_unitario_mxn IS NOT NULL
    ), 0)
  INTO v_stock, v_costo_prom, v_costo_prom_mxn
  FROM movimientos_inventario
  WHERE producto_id = p_producto_id
    AND (almacen_origen_id = p_almacen_id OR almacen_destino_id = p_almacen_id);

  -- Upsert en inventario
  INSERT INTO inventario (producto_id, almacen_id, stock_actual, costo_promedio, costo_promedio_mxn, ultima_actualizacion)
  VALUES (p_producto_id, p_almacen_id, GREATEST(v_stock, 0), v_costo_prom, v_costo_prom_mxn, NOW())
  ON CONFLICT (producto_id, almacen_id) DO UPDATE SET
    stock_actual          = GREATEST(EXCLUDED.stock_actual, 0),
    costo_promedio        = EXCLUDED.costo_promedio,
    costo_promedio_mxn    = EXCLUDED.costo_promedio_mxn,
    ultima_actualizacion  = NOW();
END;
$$ LANGUAGE plpgsql;

-- ── Vista: inventario completo ────────────────────────────────
CREATE OR REPLACE VIEW v_inventario AS
SELECT
  i.id,
  a.clave           AS almacen_clave,
  a.nombre          AS almacen_nombre,
  a.tipo            AS almacen_tipo,
  ps.codigo         AS producto_codigo,
  ps.nombre         AS producto_nombre,
  ps.tipo           AS producto_tipo,
  ps.unidad_medida,
  ps.es_producto_rst,
  c.nombre          AS categoria_nombre,
  i.stock_actual,
  ps.stock_minimo,
  CASE
    WHEN i.stock_actual <= 0                    THEN 'sin_stock'
    WHEN i.stock_actual <= ps.stock_minimo      THEN 'stock_bajo'
    WHEN i.stock_actual <= ps.stock_minimo * 2  THEN 'stock_alerta'
    ELSE                                             'ok'
  END                                           AS alerta_stock,
  i.costo_promedio,
  i.costo_moneda,
  i.costo_promedio_mxn,
  i.stock_actual * i.costo_promedio_mxn         AS valor_total_mxn,
  i.ultima_actualizacion,
  un.codigo                                     AS unidad_codigo
FROM inventario i
JOIN almacenes a ON i.almacen_id = a.id
JOIN productos_servicios ps ON i.producto_id = ps.id
LEFT JOIN categorias_producto c ON ps.categoria_id = c.id
LEFT JOIN unidades_negocio un ON a.unidad_negocio_id = un.id
WHERE a.activo = true AND ps.activo = true;
`;

// Datos iniciales: 3 almacenes generales
const seedAlmacenes = `
INSERT INTO almacenes (clave, nombre, tipo, moneda_valuacion) VALUES
  ('ALM-MXN', 'Almacen General MXN', 'general_mxn', 'MXN'),
  ('ALM-USD', 'Almacen General USD', 'general_usd', 'USD'),
  ('ALM-RST', 'Almacen RST (USD)',   'general_rst', 'USD')
ON CONFLICT (clave) DO NOTHING;
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 4 — Almacenes...');
  try {
    await pool.query(migration);
    await pool.query(seedAlmacenes);
    logger.info('Migracion Sprint 4 completada. Almacenes generales creados.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 4:', err.message);
    throw err;
  }
};

module.exports = runMigration;
