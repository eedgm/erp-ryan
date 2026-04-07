require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migration = `

-- ============================================================
-- SPRINT 6: Órdenes de Trabajo
-- ordenes_trabajo, ot_partidas, ot_estados_log
-- + función SQL ejecutar_orden_trabajo()
-- ============================================================

DO $$ BEGIN
  CREATE TYPE ot_estado AS ENUM (
    'borrador','pendiente_autorizacion','autorizada','ejecutada','cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ot_tipo AS ENUM (
    'traspaso_a_folio','consumo_directo','devolucion_almacen','ajuste_inventario'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Órdenes de Trabajo ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_trabajo (
  id                     SERIAL PRIMARY KEY,
  folio                  VARCHAR(30)   UNIQUE NOT NULL,
  tipo                   ot_tipo       NOT NULL,
  proyecto_id            INTEGER       REFERENCES proyectos(id),
  unidad_negocio_id      INTEGER       REFERENCES unidades_negocio(id),
  almacen_origen_id      INTEGER       NOT NULL REFERENCES almacenes(id),
  almacen_destino_id     INTEGER       REFERENCES almacenes(id),
  familia_presupuesto_id INTEGER       REFERENCES familias_presupuesto_catalogo(id),
  solicitante_id         INTEGER       REFERENCES usuarios(id),
  autorizado_por         INTEGER       REFERENCES usuarios(id),
  ejecutado_por          INTEGER       REFERENCES usuarios(id),
  fecha_solicitud        DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_autorizacion     TIMESTAMP,
  fecha_ejecucion        DATE,
  fecha_necesidad        DATE,
  estado                 ot_estado     DEFAULT 'borrador',
  orden_compra_id        INTEGER       REFERENCES ordenes_compra(id),
  costo_total_mxn        DECIMAL(15,2) DEFAULT 0,
  motivo                 VARCHAR(300),
  notas                  TEXT,
  creado_en              TIMESTAMP     DEFAULT NOW(),
  creado_por             INTEGER       REFERENCES usuarios(id),
  actualizado_en         TIMESTAMP     DEFAULT NOW()
);

-- ── Partidas de OT ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_partidas (
  id                   SERIAL PRIMARY KEY,
  orden_trabajo_id     INTEGER        NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  numero_partida       INTEGER        NOT NULL,
  producto_id          INTEGER        NOT NULL REFERENCES productos_servicios(id),
  descripcion          VARCHAR(300),
  unidad_medida        VARCHAR(20),
  cantidad_solicitada  DECIMAL(14,4)  NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_ejecutada   DECIMAL(14,4)  DEFAULT 0,
  stock_disponible     DECIMAL(14,4)  DEFAULT 0,
  costo_unitario_mxn   DECIMAL(15,4)  DEFAULT 0,
  costo_total_mxn      DECIMAL(15,2)  DEFAULT 0,
  estado_partida       VARCHAR(20)    DEFAULT 'pendiente'
                       CHECK (estado_partida IN ('pendiente','ejecutada','cancelada'))
);

-- ── Log de cambios de estado ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_estados_log (
  id           SERIAL PRIMARY KEY,
  ot_id        INTEGER    NOT NULL REFERENCES ordenes_trabajo(id),
  estado_antes ot_estado,
  estado_nuevo ot_estado  NOT NULL,
  comentario   TEXT,
  usuario_id   INTEGER    REFERENCES usuarios(id),
  creado_en    TIMESTAMP  DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ot_proyecto    ON ordenes_trabajo(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_ot_estado      ON ordenes_trabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ot_origen      ON ordenes_trabajo(almacen_origen_id);
CREATE INDEX IF NOT EXISTS idx_ot_unidad      ON ordenes_trabajo(unidad_negocio_id);
CREATE INDEX IF NOT EXISTS idx_ot_partidas    ON ot_partidas(orden_trabajo_id);
CREATE INDEX IF NOT EXISTS idx_ot_log         ON ot_estados_log(ot_id);

-- ── Función: ejecutar OT en una sola transacción ──────────────
-- Mueve inventario, actualiza presupuesto y cierra la OT
CREATE OR REPLACE FUNCTION ejecutar_orden_trabajo(p_ot_id INTEGER, p_usuario_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  ot             RECORD;
  partida        RECORD;
  v_stock        DECIMAL(14,4);
  v_costo_u      DECIMAL(15,4);
  v_costo_total  DECIMAL(15,2) := 0;
  v_fecha        DATE := CURRENT_DATE;
  v_errores      TEXT[] := ARRAY[]::TEXT[];
  v_tipo_sal     TEXT;
  v_tipo_ent     TEXT;
BEGIN
  SELECT * INTO ot FROM ordenes_trabajo WHERE id = p_ot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','OT no encontrada');
  END IF;
  IF ot.estado != 'autorizada' THEN
    RETURN jsonb_build_object('ok',false,'error',
      format('La OT debe estar en estado autorizada (actual: %s)', ot.estado));
  END IF;

  -- Definir tipos de movimiento según tipo de OT
  v_tipo_sal := CASE ot.tipo
    WHEN 'traspaso_a_folio'    THEN 'traspaso_salida'
    WHEN 'devolucion_almacen'  THEN 'devolucion'
    ELSE 'salida'
  END;
  v_tipo_ent := CASE ot.tipo
    WHEN 'traspaso_a_folio'    THEN 'traspaso_entrada'
    ELSE 'entrada'
  END;

  FOR partida IN
    SELECT * FROM ot_partidas
    WHERE orden_trabajo_id = p_ot_id AND estado_partida = 'pendiente'
  LOOP
    SELECT stock_actual, costo_promedio_mxn INTO v_stock, v_costo_u
    FROM inventario
    WHERE producto_id = partida.producto_id AND almacen_id = ot.almacen_origen_id;

    IF v_stock IS NULL OR v_stock < partida.cantidad_solicitada THEN
      v_errores := array_append(v_errores,
        format('Stock insuficiente prod_id=%s disp=%s req=%s',
               partida.producto_id, COALESCE(v_stock,0), partida.cantidad_solicitada));
      CONTINUE;
    END IF;

    -- Salida del origen
    INSERT INTO movimientos_inventario
      (producto_id, almacen_origen_id, almacen_destino_id, tipo, cantidad,
       costo_unitario, costo_moneda, costo_unitario_mxn, costo_total_mxn,
       proyecto_id, orden_trabajo_id, fecha, creado_por)
    VALUES (partida.producto_id, ot.almacen_origen_id, ot.almacen_destino_id,
            v_tipo_sal::movimiento_tipo, partida.cantidad_solicitada,
            v_costo_u,'MXN', v_costo_u, v_costo_u * partida.cantidad_solicitada,
            ot.proyecto_id, p_ot_id, v_fecha, p_usuario_id);

    PERFORM recalcular_stock(partida.producto_id, ot.almacen_origen_id);

    -- Entrada al destino (si aplica)
    IF ot.almacen_destino_id IS NOT NULL THEN
      INSERT INTO movimientos_inventario
        (producto_id, almacen_origen_id, almacen_destino_id, tipo, cantidad,
         costo_unitario, costo_moneda, costo_unitario_mxn, costo_total_mxn,
         proyecto_id, orden_trabajo_id, fecha, creado_por)
      VALUES (partida.producto_id, ot.almacen_origen_id, ot.almacen_destino_id,
              v_tipo_ent::movimiento_tipo, partida.cantidad_solicitada,
              v_costo_u,'MXN', v_costo_u, v_costo_u * partida.cantidad_solicitada,
              ot.proyecto_id, p_ot_id, v_fecha, p_usuario_id);
      PERFORM recalcular_stock(partida.producto_id, ot.almacen_destino_id);
    END IF;

    -- Actualizar partida
    UPDATE ot_partidas SET
      cantidad_ejecutada = partida.cantidad_solicitada,
      costo_unitario_mxn = v_costo_u,
      costo_total_mxn    = v_costo_u * partida.cantidad_solicitada,
      estado_partida     = 'ejecutada'
    WHERE id = partida.id;

    v_costo_total := v_costo_total + (v_costo_u * partida.cantidad_solicitada);

    -- Actualizar consumido en familia presupuestal (solo consumo directo)
    IF ot.tipo = 'consumo_directo'
       AND ot.familia_presupuesto_id IS NOT NULL
       AND ot.proyecto_id IS NOT NULL
    THEN
      UPDATE proyecto_presupuesto_familias
      SET consumido = consumido + (v_costo_u * partida.cantidad_solicitada)
      WHERE proyecto_id = ot.proyecto_id AND familia_id = ot.familia_presupuesto_id;
    END IF;
  END LOOP;

  IF array_length(v_errores, 1) > 0 THEN
    RETURN jsonb_build_object('ok',false,'errores', to_jsonb(v_errores));
  END IF;

  -- Cerrar la OT
  UPDATE ordenes_trabajo SET
    estado = 'ejecutada', ejecutado_por = p_usuario_id,
    fecha_ejecucion = v_fecha, costo_total_mxn = v_costo_total,
    actualizado_en = NOW()
  WHERE id = p_ot_id;

  INSERT INTO ot_estados_log (ot_id, estado_antes, estado_nuevo, comentario, usuario_id)
  VALUES (p_ot_id, 'autorizada', 'ejecutada', 'Ejecutada correctamente', p_usuario_id);

  RETURN jsonb_build_object('ok',true,'costo_total_mxn', v_costo_total);
END;
$$ LANGUAGE plpgsql;
`;

const runMigration = async () => {
  logger.info('Iniciando migracion Sprint 6 — Ordenes de Trabajo...');
  try {
    await pool.query(migration);
    logger.info('Migracion Sprint 6 completada.');
    console.log("done");
  } catch (err) {
    logger.error('Error en migracion Sprint 6:', err.message);
    throw err;
  }
};

module.exports = runMigration;
