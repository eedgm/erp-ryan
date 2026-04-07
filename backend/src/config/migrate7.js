require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 7: Ingresos, Gastos e IVA
-- ingresos, ingreso_partidas, cobros,
-- gastos, gasto_partidas, pagos_gasto,
-- periodos_iva
-- ============================================================

-- ── Ingresos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingresos (
  id                  SERIAL PRIMARY KEY,
  folio_interno       VARCHAR(30)   UNIQUE NOT NULL,
  proyecto_id         INTEGER       REFERENCES proyectos(id),
  unidad_negocio_id   INTEGER       NOT NULL REFERENCES unidades_negocio(id),
  cliente_id          INTEGER       REFERENCES clientes(id),
  fecha               DATE          NOT NULL,
  concepto            VARCHAR(300)  NOT NULL,
  tipo                VARCHAR(40)   DEFAULT 'Venta Servicio'
                      CHECK (tipo IN (
                        'Venta Servicio','Venta Suministro',
                        'Anticipo','Estimacion','Otro'
                      )),
  -- Moneda original
  moneda              moneda_tipo   DEFAULT 'MXN',
  subtotal            DECIMAL(15,2) NOT NULL CHECK (subtotal >= 0),
  tasa_iva            DECIMAL(5,2)  DEFAULT 16,
  iva                 DECIMAL(15,2) NOT NULL DEFAULT 0,
  total               DECIMAL(15,2) NOT NULL,
  -- Equivalente MXN para reportes
  tipo_cambio         DECIMAL(18,8) DEFAULT 1,
  subtotal_mxn        DECIMAL(15,2),
  iva_mxn             DECIMAL(15,2),
  total_mxn           DECIMAL(15,2),
  -- Cobro
  estado_cobro        VARCHAR(20)   DEFAULT 'Pendiente'
                      CHECK (estado_cobro IN ('Pendiente','Cobro Parcial','Cobrado')),
  fecha_cobro         DATE,
  -- Pagado en
  cuenta_bancaria_id  INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id   INTEGER       REFERENCES carteras_cripto(id),
  referencia_externa  VARCHAR(100),
  notas               TEXT,
  creado_en           TIMESTAMP     DEFAULT NOW(),
  creado_por          INTEGER       REFERENCES usuarios(id),
  actualizado_en      TIMESTAMP     DEFAULT NOW()
);

-- ── Partidas de Ingreso ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingreso_partidas (
  id                SERIAL PRIMARY KEY,
  ingreso_id        INTEGER       NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
  numero_partida    INTEGER       NOT NULL,
  producto_id       INTEGER       REFERENCES productos_servicios(id),
  descripcion       VARCHAR(300)  NOT NULL,
  unidad_medida     VARCHAR(20),
  cantidad          DECIMAL(12,4) NOT NULL DEFAULT 1,
  precio_unitario   DECIMAL(15,4) NOT NULL,
  descuento_pct     DECIMAL(5,2)  DEFAULT 0,
  subtotal          DECIMAL(15,2) NOT NULL,
  aplica_iva        BOOLEAN       DEFAULT TRUE,
  tasa_iva          DECIMAL(5,2)  DEFAULT 16,
  iva               DECIMAL(15,2) DEFAULT 0,
  total             DECIMAL(15,2) NOT NULL
);

-- ── Cobros ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobros (
  id                  SERIAL PRIMARY KEY,
  ingreso_id          INTEGER       NOT NULL REFERENCES ingresos(id),
  fecha               DATE          NOT NULL,
  monto               DECIMAL(15,2) NOT NULL CHECK (monto > 0),
  moneda              moneda_tipo   DEFAULT 'MXN',
  tipo_cambio         DECIMAL(18,8) DEFAULT 1,
  monto_mxn           DECIMAL(15,2),
  forma_pago          VARCHAR(40),
  cuenta_bancaria_id  INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id   INTEGER       REFERENCES carteras_cripto(id),
  hash_cripto         VARCHAR(200),
  referencia          VARCHAR(100),
  notas               TEXT,
  creado_por          INTEGER       REFERENCES usuarios(id),
  creado_en           TIMESTAMP     DEFAULT NOW()
);

-- ── Gastos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos (
  id                    SERIAL PRIMARY KEY,
  folio_interno         VARCHAR(30)   UNIQUE NOT NULL,
  proyecto_id           INTEGER       REFERENCES proyectos(id),
  unidad_negocio_id     INTEGER       NOT NULL REFERENCES unidades_negocio(id),
  proveedor_id          INTEGER       REFERENCES proveedores(id),
  familia_presupuesto_id INTEGER      REFERENCES familias_presupuesto_catalogo(id),
  fecha                 DATE          NOT NULL,
  concepto              VARCHAR(300)  NOT NULL,
  categoria             VARCHAR(60)   DEFAULT 'Operacion'
                        CHECK (categoria IN (
                          'Material','Mano de Obra','Subcontrato',
                          'Administracion','Viaticos','Flete','Operacion','Otro'
                        )),
  -- Moneda original
  moneda                moneda_tipo   DEFAULT 'MXN',
  subtotal              DECIMAL(15,2) NOT NULL CHECK (subtotal >= 0),
  tasa_iva              DECIMAL(5,2)  DEFAULT 16,
  iva_acreditable       DECIMAL(15,2) DEFAULT 0,
  total                 DECIMAL(15,2) NOT NULL,
  -- Equivalente MXN para reportes
  tipo_cambio           DECIMAL(18,8) DEFAULT 1,
  subtotal_mxn          DECIMAL(15,2),
  iva_mxn               DECIMAL(15,2),
  total_mxn             DECIMAL(15,2),
  -- Comprobante
  comprobante_tipo      VARCHAR(30)   DEFAULT 'Sin comprobante'
                        CHECK (comprobante_tipo IN (
                          'Factura','Recibo','Nota','Sin comprobante'
                        )),
  comprobante_folio     VARCHAR(80),
  comprobante_url       VARCHAR(500),
  -- Pago
  estado_pago           VARCHAR(20)   DEFAULT 'Pendiente'
                        CHECK (estado_pago IN ('Pendiente','Pagado','Cancelado')),
  fecha_pago            DATE,
  cuenta_bancaria_id    INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id     INTEGER       REFERENCES carteras_cripto(id),
  hash_cripto           VARCHAR(200),
  notas                 TEXT,
  -- Auditoría
  creado_en             TIMESTAMP     DEFAULT NOW(),
  creado_por            INTEGER       REFERENCES usuarios(id),
  actualizado_en        TIMESTAMP     DEFAULT NOW()
);

-- ── Partidas de Gasto ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gasto_partidas (
  id                SERIAL PRIMARY KEY,
  gasto_id          INTEGER       NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
  numero_partida    INTEGER       NOT NULL,
  producto_id       INTEGER       REFERENCES productos_servicios(id),
  descripcion       VARCHAR(300)  NOT NULL,
  unidad_medida     VARCHAR(20),
  cantidad          DECIMAL(12,4) NOT NULL DEFAULT 1,
  precio_unitario   DECIMAL(15,4) NOT NULL,
  subtotal          DECIMAL(15,2) NOT NULL,
  aplica_iva        BOOLEAN       DEFAULT TRUE,
  tasa_iva          DECIMAL(5,2)  DEFAULT 16,
  iva               DECIMAL(15,2) DEFAULT 0,
  total             DECIMAL(15,2) NOT NULL
);

-- ── Pagos de Gasto ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_gasto (
  id                  SERIAL PRIMARY KEY,
  gasto_id            INTEGER       NOT NULL REFERENCES gastos(id),
  fecha               DATE          NOT NULL,
  monto               DECIMAL(15,2) NOT NULL CHECK (monto > 0),
  moneda              moneda_tipo   DEFAULT 'MXN',
  tipo_cambio         DECIMAL(18,8) DEFAULT 1,
  monto_mxn           DECIMAL(15,2),
  forma_pago          VARCHAR(40),
  cuenta_bancaria_id  INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id   INTEGER       REFERENCES carteras_cripto(id),
  hash_cripto         VARCHAR(200),
  referencia          VARCHAR(100),
  notas               TEXT,
  creado_por          INTEGER       REFERENCES usuarios(id),
  creado_en           TIMESTAMP     DEFAULT NOW()
);

-- ── Periodos IVA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodos_iva (
  id                SERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  mes               INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  iva_trasladado    DECIMAL(15,2) DEFAULT 0,
  iva_acreditable   DECIMAL(15,2) DEFAULT 0,
  iva_neto          DECIMAL(15,2) DEFAULT 0,
  estado            VARCHAR(20)   DEFAULT 'Abierto'
                    CHECK (estado IN ('Abierto','Cerrado')),
  notas             TEXT,
  cerrado_en        TIMESTAMP,
  cerrado_por       INTEGER       REFERENCES usuarios(id),
  UNIQUE(anio, mes)
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ingresos_proyecto   ON ingresos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_unidad     ON ingresos(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha      ON ingresos(fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_cliente    ON ingresos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_cobro      ON ingresos(estado_cobro);
CREATE INDEX IF NOT EXISTS idx_cobros_ingreso      ON cobros(ingreso_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proyecto     ON gastos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_gastos_unidad       ON gastos(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha        ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor    ON gastos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_familia      ON gastos(familia_presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_gastos_pago         ON gastos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_gasto_id      ON pagos_gasto(gasto_id);
CREATE INDEX IF NOT EXISTS idx_periodos_iva_anio   ON periodos_iva(anio, mes);

-- ── Función: cerrar periodo IVA y recalcular ──────────────────
CREATE OR REPLACE FUNCTION recalcular_periodo_iva(p_anio INTEGER, p_mes INTEGER)
RETURNS void AS $$
DECLARE
  v_trasladado  DECIMAL(15,2);
  v_acreditable DECIMAL(15,2);
BEGIN
  -- IVA trasladado = IVA de ingresos del periodo
  SELECT COALESCE(SUM(iva_mxn), 0) INTO v_trasladado
  FROM ingresos
  WHERE EXTRACT(YEAR FROM fecha) = p_anio
    AND EXTRACT(MONTH FROM fecha) = p_mes;

  -- IVA acreditable = IVA de gastos con factura del periodo
  SELECT COALESCE(SUM(iva_mxn), 0) INTO v_acreditable
  FROM gastos
  WHERE EXTRACT(YEAR FROM fecha) = p_anio
    AND EXTRACT(MONTH FROM fecha) = p_mes
    AND comprobante_tipo = 'Factura';

  INSERT INTO periodos_iva (anio, mes, iva_trasladado, iva_acreditable, iva_neto)
  VALUES (p_anio, p_mes, v_trasladado, v_acreditable, v_trasladado - v_acreditable)
  ON CONFLICT (anio, mes) DO UPDATE SET
    iva_trasladado  = EXCLUDED.iva_trasladado,
    iva_acreditable = EXCLUDED.iva_acreditable,
    iva_neto        = EXCLUDED.iva_trasladado - EXCLUDED.iva_acreditable;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger: recalcular IVA al insertar/actualizar ingreso ────
CREATE OR REPLACE FUNCTION trigger_iva_ingreso() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalcular_periodo_iva(
    EXTRACT(YEAR  FROM NEW.fecha)::INTEGER,
    EXTRACT(MONTH FROM NEW.fecha)::INTEGER
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_iva_ingreso ON ingresos;
CREATE TRIGGER trg_iva_ingreso
  AFTER INSERT OR UPDATE ON ingresos
  FOR EACH ROW EXECUTE FUNCTION trigger_iva_ingreso();

-- ── Trigger: recalcular IVA al insertar/actualizar gasto ──────
CREATE OR REPLACE FUNCTION trigger_iva_gasto() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalcular_periodo_iva(
    EXTRACT(YEAR  FROM NEW.fecha)::INTEGER,
    EXTRACT(MONTH FROM NEW.fecha)::INTEGER
  );
  -- Actualizar consumido de familia en proyecto
  IF NEW.proyecto_id IS NOT NULL AND NEW.familia_presupuesto_id IS NOT NULL THEN
    PERFORM actualizar_consumido_familia(NEW.proyecto_id, NEW.familia_presupuesto_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_iva_gasto ON gastos;
CREATE TRIGGER trg_iva_gasto
  AFTER INSERT OR UPDATE ON gastos
  FOR EACH ROW EXECUTE FUNCTION trigger_iva_gasto();

-- ── Trigger: actualizar estado_cobro en ingreso ───────────────
CREATE OR REPLACE FUNCTION trigger_estado_cobro() RETURNS TRIGGER AS $$
DECLARE
  v_total_cobrado DECIMAL(15,2);
  v_total_ingreso DECIMAL(15,2);
  v_nuevo_estado  VARCHAR(20);
BEGIN
  SELECT COALESCE(SUM(monto_mxn),0) INTO v_total_cobrado
  FROM cobros WHERE ingreso_id = NEW.ingreso_id;

  SELECT total_mxn INTO v_total_ingreso
  FROM ingresos WHERE id = NEW.ingreso_id;

  IF v_total_cobrado <= 0 THEN
    v_nuevo_estado := 'Pendiente';
  ELSIF v_total_cobrado >= v_total_ingreso THEN
    v_nuevo_estado := 'Cobrado';
  ELSE
    v_nuevo_estado := 'Cobro Parcial';
  END IF;

  UPDATE ingresos SET
    estado_cobro = v_nuevo_estado,
    fecha_cobro  = CASE WHEN v_nuevo_estado = 'Cobrado' THEN NEW.fecha ELSE NULL END,
    actualizado_en = NOW()
  WHERE id = NEW.ingreso_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estado_cobro ON cobros;
CREATE TRIGGER trg_estado_cobro
  AFTER INSERT OR UPDATE OR DELETE ON cobros
  FOR EACH ROW EXECUTE FUNCTION trigger_estado_cobro();

-- ── Trigger: actualizar estado_pago en gasto ─────────────────
CREATE OR REPLACE FUNCTION trigger_estado_pago() RETURNS TRIGGER AS $$
DECLARE
  v_total_pagado DECIMAL(15,2);
  v_total_gasto  DECIMAL(15,2);
BEGIN
  SELECT COALESCE(SUM(monto_mxn),0) INTO v_total_pagado
  FROM pagos_gasto WHERE gasto_id = NEW.gasto_id;

  SELECT total_mxn INTO v_total_gasto
  FROM gastos WHERE id = NEW.gasto_id;

  UPDATE gastos SET
    estado_pago  = CASE WHEN v_total_pagado >= v_total_gasto THEN 'Pagado' ELSE 'Pendiente' END,
    fecha_pago   = CASE WHEN v_total_pagado >= v_total_gasto THEN NEW.fecha ELSE NULL END,
    actualizado_en = NOW()
  WHERE id = NEW.gasto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estado_pago ON pagos_gasto;
CREATE TRIGGER trg_estado_pago
  AFTER INSERT OR UPDATE ON pagos_gasto
  FOR EACH ROW EXECUTE FUNCTION trigger_estado_pago();
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 7 — Ingresos, Gastos e IVA...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 7 completada. 6 tablas + 4 triggers + 2 funciones SQL.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 7:', err.message);
    throw err;
  }
};

module.exports = runMigration;
