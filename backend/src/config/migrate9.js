require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 9: RRHH + Nómina + Checador
-- empleados, contratos, asistencias, periodos_nomina,
-- nomina_lineas, pagos_nomina, importaciones_checador
-- ============================================================

DO $$ BEGIN
  CREATE TYPE contrato_tipo AS ENUM
    ('Indefinido','Determinado','Por Obra','Honorarios','Freelance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE nomina_estado AS ENUM
    ('Borrador','Calculada','Autorizada','Pagada','Cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pago_forma AS ENUM
    ('Transferencia','Efectivo','Cheque','USDT','USDC','BTC','ETH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Empleados ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleados (
  id                    SERIAL PRIMARY KEY,
  usuario_id            INTEGER       REFERENCES usuarios(id),     -- puede ser null si no tiene acceso
  numero_empleado       VARCHAR(20)   UNIQUE NOT NULL,
  nombre                VARCHAR(100)  NOT NULL,
  apellidos             VARCHAR(100),
  fecha_nacimiento      DATE,
  curp                  VARCHAR(18),
  rfc                   VARCHAR(13),
  imss                  VARCHAR(11),
  telefono              VARCHAR(20),
  email_personal        VARCHAR(100),
  direccion             TEXT,
  -- Organización
  unidad_negocio_id     INTEGER       REFERENCES unidades_negocio(id),
  departamento_id       INTEGER       REFERENCES departamentos(id),
  puesto                VARCHAR(100),
  tipo_jornada          VARCHAR(30)   DEFAULT 'Tiempo Completo'
                        CHECK (tipo_jornada IN ('Tiempo Completo','Medio Tiempo','Por Horas','Guardia')),
  -- Checador
  id_biometrico         VARCHAR(20)   UNIQUE,     -- ID en el ZKTeco
  -- Estado
  activo                BOOLEAN       DEFAULT TRUE,
  fecha_ingreso         DATE,
  fecha_baja            DATE,
  motivo_baja           TEXT,
  notas                 TEXT,
  creado_en             TIMESTAMP     DEFAULT NOW(),
  creado_por            INTEGER       REFERENCES usuarios(id)
);

-- ── Contratos de Empleado ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratos_empleado (
  id                    SERIAL PRIMARY KEY,
  empleado_id           INTEGER       NOT NULL REFERENCES empleados(id),
  tipo_contrato         contrato_tipo DEFAULT 'Indefinido',
  fecha_inicio          DATE          NOT NULL,
  fecha_fin             DATE,
  -- Salario
  salario_base          DECIMAL(14,2) NOT NULL,
  moneda_salario        moneda_tipo   DEFAULT 'MXN',
  periodicidad          VARCHAR(20)   DEFAULT 'Quincenal'
                        CHECK (periodicidad IN ('Semanal','Quincenal','Mensual','Por Hora')),
  -- Prestaciones
  tiene_imss            BOOLEAN       DEFAULT TRUE,
  tiene_vacaciones      BOOLEAN       DEFAULT TRUE,
  dias_vacaciones       INTEGER       DEFAULT 6,
  tiene_aguinaldo       BOOLEAN       DEFAULT TRUE,
  dias_aguinaldo        INTEGER       DEFAULT 15,
  -- Bono puntualidad
  bono_puntualidad      DECIMAL(10,2) DEFAULT 0,
  moneda_bono           moneda_tipo   DEFAULT 'MXN',
  -- Estado
  activo                BOOLEAN       DEFAULT TRUE,
  creado_en             TIMESTAMP     DEFAULT NOW(),
  creado_por            INTEGER       REFERENCES usuarios(id)
);

-- ── Importaciones del checador ────────────────────────────────
CREATE TABLE IF NOT EXISTS importaciones_checador (
  id                    SERIAL PRIMARY KEY,
  fuente                VARCHAR(20)   DEFAULT 'ZKTeco'
                        CHECK (fuente IN ('ZKTeco','App Movil','Manual')),
  nombre_archivo        VARCHAR(200),
  periodo_desde         DATE,
  periodo_hasta         DATE,
  total_registros       INTEGER       DEFAULT 0,
  importados            INTEGER       DEFAULT 0,
  errores               INTEGER       DEFAULT 0,
  detalle_errores       JSONB,
  importado_por         INTEGER       REFERENCES usuarios(id),
  creado_en             TIMESTAMP     DEFAULT NOW()
);

-- ── Asistencias ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencias (
  id                    SERIAL PRIMARY KEY,
  empleado_id           INTEGER       NOT NULL REFERENCES empleados(id),
  fecha                 DATE          NOT NULL,
  hora_entrada          TIME,
  hora_salida           TIME,
  minutos_laborados     INTEGER       DEFAULT 0,
  tipo_dia              VARCHAR(20)   DEFAULT 'Laboral'
                        CHECK (tipo_dia IN ('Laboral','Descanso','Festivo','Vacaciones','Permiso','Falta')),
  -- Puntualidad
  minutos_tarde         INTEGER       DEFAULT 0,   -- minutos de retraso
  tiene_bono            BOOLEAN       DEFAULT FALSE,
  fuente                VARCHAR(20)   DEFAULT 'ZKTeco',
  importacion_id        INTEGER       REFERENCES importaciones_checador(id),
  notas                 TEXT,
  creado_en             TIMESTAMP     DEFAULT NOW(),
  UNIQUE(empleado_id, fecha)
);

-- ── Periodos de Nómina ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodos_nomina (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(100)  NOT NULL,
  periodicidad          VARCHAR(20)   NOT NULL,
  fecha_inicio          DATE          NOT NULL,
  fecha_fin             DATE          NOT NULL,
  fecha_pago            DATE,
  unidad_negocio_id     INTEGER       REFERENCES unidades_negocio(id),
  estado                nomina_estado DEFAULT 'Borrador',
  -- Totales calculados
  total_percepciones    DECIMAL(15,2) DEFAULT 0,
  total_deducciones     DECIMAL(15,2) DEFAULT 0,
  total_neto            DECIMAL(15,2) DEFAULT 0,
  total_cripto          DECIMAL(18,8) DEFAULT 0,
  moneda_cripto         moneda_tipo,
  -- Autorización
  calculado_en          TIMESTAMP,
  autorizado_por        INTEGER       REFERENCES usuarios(id),
  autorizado_en         TIMESTAMP,
  pagado_en             TIMESTAMP,
  notas                 TEXT,
  creado_en             TIMESTAMP     DEFAULT NOW(),
  creado_por            INTEGER       REFERENCES usuarios(id)
);

-- ── Líneas de Nómina ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nomina_lineas (
  id                    SERIAL PRIMARY KEY,
  periodo_nomina_id     INTEGER       NOT NULL REFERENCES periodos_nomina(id) ON DELETE CASCADE,
  empleado_id           INTEGER       NOT NULL REFERENCES empleados(id),
  contrato_id           INTEGER       REFERENCES contratos_empleado(id),
  -- Días
  dias_periodo          INTEGER       DEFAULT 15,
  dias_trabajados       INTEGER       DEFAULT 15,
  dias_falta            INTEGER       DEFAULT 0,
  dias_vacaciones       INTEGER       DEFAULT 0,
  -- Percepciones
  salario_base          DECIMAL(14,2) DEFAULT 0,
  bono_puntualidad      DECIMAL(10,2) DEFAULT 0,
  horas_extra           DECIMAL(6,2)  DEFAULT 0,
  importe_horas_extra   DECIMAL(10,2) DEFAULT 0,
  otros_ingresos        DECIMAL(10,2) DEFAULT 0,
  total_percepciones    DECIMAL(14,2) DEFAULT 0,
  -- Deducciones
  imss_empleado         DECIMAL(10,2) DEFAULT 0,
  isr                   DECIMAL(10,2) DEFAULT 0,
  faltas_descuento      DECIMAL(10,2) DEFAULT 0,
  otros_descuentos      DECIMAL(10,2) DEFAULT 0,
  total_deducciones     DECIMAL(14,2) DEFAULT 0,
  -- Neto
  neto_pagar            DECIMAL(14,2) DEFAULT 0,
  -- Pago (puede ser en cripto)
  moneda_pago           moneda_tipo   DEFAULT 'MXN',
  tipo_cambio_pago      DECIMAL(18,8) DEFAULT 1,
  neto_en_moneda        DECIMAL(18,8) DEFAULT 0,
  -- Estado
  estado                VARCHAR(20)   DEFAULT 'Pendiente'
                        CHECK (estado IN ('Pendiente','Pagado','Cancelado')),
  forma_pago            pago_forma    DEFAULT 'Transferencia',
  cuenta_destino        VARCHAR(200),
  hash_cripto           VARCHAR(200),
  fecha_pago            DATE,
  UNIQUE(periodo_nomina_id, empleado_id)
);

-- ── Pagos de Nómina ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_nomina (
  id                    SERIAL PRIMARY KEY,
  nomina_linea_id       INTEGER       NOT NULL REFERENCES nomina_lineas(id),
  periodo_nomina_id     INTEGER       NOT NULL REFERENCES periodos_nomina(id),
  empleado_id           INTEGER       NOT NULL REFERENCES empleados(id),
  fecha                 DATE          NOT NULL,
  monto_mxn             DECIMAL(14,2) NOT NULL,
  moneda_pago           moneda_tipo   DEFAULT 'MXN',
  monto_moneda          DECIMAL(18,8),
  tipo_cambio           DECIMAL(18,8) DEFAULT 1,
  forma_pago            pago_forma,
  cuenta_bancaria_id    INTEGER       REFERENCES cuentas_bancarias(id),
  cartera_cripto_id     INTEGER       REFERENCES carteras_cripto(id),
  referencia            VARCHAR(100),
  hash_cripto           VARCHAR(200),
  notas                 TEXT,
  registrado_por        INTEGER       REFERENCES usuarios(id),
  creado_en             TIMESTAMP     DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_empleados_unidad      ON empleados(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_empleados_usuario     ON empleados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_empleados_biometrico  ON empleados(id_biometrico);
CREATE INDEX IF NOT EXISTS idx_empleados_activo      ON empleados(activo);
CREATE INDEX IF NOT EXISTS idx_asistencias_empleado  ON asistencias(empleado_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha     ON asistencias(fecha);
CREATE INDEX IF NOT EXISTS idx_nomina_periodo        ON nomina_lineas(periodo_nomina_id);
CREATE INDEX IF NOT EXISTS idx_nomina_empleado       ON nomina_lineas(empleado_id);
CREATE INDEX IF NOT EXISTS idx_periodos_nomina_estado ON periodos_nomina(estado);

-- ── Función: calcular bono de puntualidad ─────────────────────
-- Retorna TRUE si el empleado califica para el bono en el periodo
CREATE OR REPLACE FUNCTION califica_bono_puntualidad(
  p_empleado_id INTEGER,
  p_desde DATE,
  p_hasta DATE,
  p_max_minutos_tarde INTEGER DEFAULT 10  -- tolerancia en minutos
) RETURNS BOOLEAN AS $$
DECLARE
  v_faltas INTEGER;
  v_tardes INTEGER;
BEGIN
  -- Días de falta sin justificación
  SELECT COUNT(*) INTO v_faltas
  FROM asistencias
  WHERE empleado_id = p_empleado_id
    AND fecha BETWEEN p_desde AND p_hasta
    AND tipo_dia = 'Falta';

  -- Días con llegada tarde (más de la tolerancia)
  SELECT COUNT(*) INTO v_tardes
  FROM asistencias
  WHERE empleado_id = p_empleado_id
    AND fecha BETWEEN p_desde AND p_hasta
    AND tipo_dia = 'Laboral'
    AND minutos_tarde > p_max_minutos_tarde;

  -- Califica si no tiene faltas ni llegadas tarde
  RETURN (v_faltas = 0 AND v_tardes = 0);
END;
$$ LANGUAGE plpgsql;

-- ── Función: calcular nómina de un periodo ────────────────────
CREATE OR REPLACE FUNCTION calcular_nomina_periodo(p_periodo_id INTEGER)
RETURNS void AS $$
DECLARE
  v_periodo   RECORD;
  v_empleado  RECORD;
  v_contrato  RECORD;
  v_dias_periodo   INTEGER;
  v_dias_trabajados INTEGER;
  v_dias_falta     INTEGER;
  v_salario_dia    DECIMAL(14,4);
  v_salario_base   DECIMAL(14,2);
  v_bono           DECIMAL(10,2);
  v_descuento_falta DECIMAL(10,2);
  v_total_perc     DECIMAL(14,2);
  v_total_ded      DECIMAL(14,2);
  v_neto           DECIMAL(14,2);
BEGIN
  SELECT * INTO v_periodo FROM periodos_nomina WHERE id = p_periodo_id;

  IF v_periodo.estado NOT IN ('Borrador','Calculada') THEN
    RAISE EXCEPTION 'Solo se puede calcular en estado Borrador o Calculada';
  END IF;

  v_dias_periodo := v_periodo.fecha_fin - v_periodo.fecha_inicio + 1;

  -- Iterar empleados activos de la unidad
  FOR v_empleado IN
    SELECT e.* FROM empleados e
    WHERE e.activo = true
      AND (v_periodo.unidad_negocio_id IS NULL OR e.unidad_negocio_id = v_periodo.unidad_negocio_id)
  LOOP
    -- Obtener contrato activo
    SELECT * INTO v_contrato
    FROM contratos_empleado
    WHERE empleado_id = v_empleado.id AND activo = true
    ORDER BY fecha_inicio DESC LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Calcular días trabajados y faltas en el periodo
    SELECT
      COALESCE(COUNT(*) FILTER (WHERE tipo_dia = 'Laboral'), 0),
      COALESCE(COUNT(*) FILTER (WHERE tipo_dia = 'Falta'), 0)
    INTO v_dias_trabajados, v_dias_falta
    FROM asistencias
    WHERE empleado_id = v_empleado.id
      AND fecha BETWEEN v_periodo.fecha_inicio AND v_periodo.fecha_fin;

    -- Salario del periodo según periodicidad
    v_salario_dia := v_contrato.salario_base / CASE v_contrato.periodicidad
      WHEN 'Quincenal' THEN 15
      WHEN 'Mensual'   THEN 30
      WHEN 'Semanal'   THEN 7
      ELSE 15
    END;

    -- Salario base del periodo (proporcional si hay días trabajados registrados)
    v_salario_base := CASE
      WHEN v_dias_trabajados > 0 THEN v_salario_dia * (v_dias_trabajados + v_dias_falta)
      ELSE v_contrato.salario_base
    END;

    -- Descuento por faltas
    v_descuento_falta := v_salario_dia * v_dias_falta;

    -- Bono puntualidad
    v_bono := 0;
    IF v_contrato.bono_puntualidad > 0 THEN
      IF califica_bono_puntualidad(v_empleado.id, v_periodo.fecha_inicio, v_periodo.fecha_fin) THEN
        v_bono := v_contrato.bono_puntualidad;
      END IF;
    END IF;

    v_total_perc := v_salario_base + v_bono;
    v_total_ded  := v_descuento_falta;           -- IMSS e ISR simplificado (registro interno)
    v_neto       := v_total_perc - v_total_ded;

    -- Upsert en nomina_lineas
    INSERT INTO nomina_lineas (
      periodo_nomina_id, empleado_id, contrato_id,
      dias_periodo, dias_trabajados, dias_falta,
      salario_base, bono_puntualidad, faltas_descuento,
      total_percepciones, total_deducciones, neto_pagar,
      moneda_pago, neto_en_moneda
    ) VALUES (
      p_periodo_id, v_empleado.id, v_contrato.id,
      v_dias_periodo, v_dias_trabajados, v_dias_falta,
      v_salario_base, v_bono, v_descuento_falta,
      v_total_perc, v_total_ded, v_neto,
      v_contrato.moneda_salario, v_neto  -- se ajusta con TC en el controlador
    )
    ON CONFLICT (periodo_nomina_id, empleado_id) DO UPDATE SET
      dias_trabajados     = EXCLUDED.dias_trabajados,
      dias_falta          = EXCLUDED.dias_falta,
      salario_base        = EXCLUDED.salario_base,
      bono_puntualidad    = EXCLUDED.bono_puntualidad,
      faltas_descuento    = EXCLUDED.faltas_descuento,
      total_percepciones  = EXCLUDED.total_percepciones,
      total_deducciones   = EXCLUDED.total_deducciones,
      neto_pagar          = EXCLUDED.neto_pagar;
  END LOOP;

  -- Actualizar totales del periodo
  UPDATE periodos_nomina SET
    estado           = 'Calculada',
    calculado_en     = NOW(),
    total_percepciones = (SELECT COALESCE(SUM(total_percepciones),0) FROM nomina_lineas WHERE periodo_nomina_id = p_periodo_id),
    total_deducciones  = (SELECT COALESCE(SUM(total_deducciones),0)  FROM nomina_lineas WHERE periodo_nomina_id = p_periodo_id),
    total_neto         = (SELECT COALESCE(SUM(neto_pagar),0)          FROM nomina_lineas WHERE periodo_nomina_id = p_periodo_id)
  WHERE id = p_periodo_id;
END;
$$ LANGUAGE plpgsql;
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 9 — RRHH y Nomina...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 9 completada. 7 tablas + 2 funciones SQL.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 9:', err.message);
    throw err;
  }
};

module.exports = runMigration;
