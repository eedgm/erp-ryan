const { query } = require('../config/database');
const logger = require('../utils/logger');

// ── Helper: filtro de unidad ──────────────────────────────────
const whereUnidad = (alias, unidadFiltro) =>
  unidadFiltro ? `AND ${alias}.unidad_negocio_id = ${unidadFiltro}` : '';

// ── Helper: rango de fechas ───────────────────────────────────
const whereRango = (alias, desde, hasta) => {
  let w = '';
  if (desde) w += ` AND ${alias}.fecha >= '${desde}'`;
  if (hasta) w += ` AND ${alias}.fecha <= '${hasta}'`;
  return w;
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/estado-resultados
// ════════════════════════════════════════════════════════════
const estadoResultados = async (req, res) => {
  try {
    const { desde, hasta, unidad_id, agrupar_por = 'mes' } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    // ── Ingresos por tipo ──────────────────────────────────
    const ingresosSQL = `
      SELECT
        un.codigo                                        AS unidad,
        un.nombre                                        AS unidad_nombre,
        i.tipo,
        COALESCE(SUM(i.subtotal_mxn), 0)                AS subtotal,
        COALESCE(SUM(i.iva_mxn), 0)                     AS iva,
        COALESCE(SUM(i.total_mxn), 0)                   AS total,
        COUNT(*)                                         AS num_registros
      FROM ingresos i
      JOIN unidades_negocio un ON i.unidad_negocio_id = un.id
      WHERE 1=1
        ${whereRango('i', desde, hasta)}
        ${unidadFiltro ? `AND i.unidad_negocio_id = ${unidadFiltro}` : ''}
      GROUP BY un.id, un.codigo, un.nombre, i.tipo
      ORDER BY un.codigo, i.tipo
    `;

    // ── Gastos por categoría ───────────────────────────────
    const gastosSQL = `
      SELECT
        un.codigo                                        AS unidad,
        un.nombre                                        AS unidad_nombre,
        g.categoria,
        COALESCE(SUM(g.subtotal_mxn), 0)                AS subtotal,
        COALESCE(SUM(g.iva_mxn), 0)                     AS iva_acreditable,
        COALESCE(SUM(g.total_mxn), 0)                   AS total,
        COUNT(*)                                         AS num_registros
      FROM gastos g
      JOIN unidades_negocio un ON g.unidad_negocio_id = un.id
      WHERE 1=1
        ${whereRango('g', desde, hasta)}
        ${unidadFiltro ? `AND g.unidad_negocio_id = ${unidadFiltro}` : ''}
      GROUP BY un.id, un.codigo, un.nombre, g.categoria
      ORDER BY un.codigo, g.categoria
    `;

    // ── Totales consolidados ───────────────────────────────
    const consolidadoSQL = `
      SELECT
        COALESCE(SUM(i.subtotal_mxn), 0)                AS total_ingresos_subtotal,
        COALESCE(SUM(i.iva_mxn), 0)                     AS total_iva_cobrado,
        COALESCE(SUM(i.total_mxn), 0)                   AS total_ingresos,
        COALESCE(SUM(i.total_mxn) FILTER (WHERE i.tipo IN ('Venta Servicio','Estimacion')), 0) AS ingresos_servicios,
        COALESCE(SUM(i.total_mxn) FILTER (WHERE i.tipo = 'Venta Suministro'), 0)              AS ingresos_suministros,
        COALESCE(SUM(i.total_mxn) FILTER (WHERE i.tipo IN ('Anticipo','Otro')), 0)            AS ingresos_otros
      FROM ingresos i
      WHERE 1=1
        ${whereRango('i', desde, hasta)}
        ${unidadFiltro ? `AND i.unidad_negocio_id = ${unidadFiltro}` : ''}
    `;

    const gastosTotSQL = `
      SELECT
        COALESCE(SUM(g.subtotal_mxn), 0)                AS total_gastos_subtotal,
        COALESCE(SUM(g.iva_mxn) FILTER (WHERE g.comprobante_tipo = 'Factura'), 0) AS total_iva_acreditable,
        COALESCE(SUM(g.total_mxn), 0)                   AS total_gastos,
        COALESCE(SUM(g.total_mxn) FILTER (WHERE g.categoria IN ('Material','Subcontrato','Flete')), 0) AS costos_directos,
        COALESCE(SUM(g.total_mxn) FILTER (WHERE g.categoria IN ('Mano de Obra')), 0)                  AS costo_mano_obra,
        COALESCE(SUM(g.total_mxn) FILTER (WHERE g.categoria IN ('Administracion','Viaticos','Operacion','Otro')), 0) AS gastos_operacion
      FROM gastos g
      WHERE 1=1
        ${whereRango('g', desde, hasta)}
        ${unidadFiltro ? `AND g.unidad_negocio_id = ${unidadFiltro}` : ''}
    `;

    // ── Tendencia mensual ──────────────────────────────────
    const tendenciaSQL = `
      SELECT
        TO_CHAR(fecha_mes, 'YYYY-MM')                   AS periodo,
        TO_CHAR(fecha_mes, 'Mon YYYY')                  AS periodo_label,
        COALESCE(SUM(total_ingresos), 0)                AS ingresos,
        COALESCE(SUM(total_gastos), 0)                  AS gastos,
        COALESCE(SUM(total_ingresos), 0) - COALESCE(SUM(total_gastos), 0) AS utilidad
      FROM (
        SELECT DATE_TRUNC('month', fecha) AS fecha_mes, total_mxn AS total_ingresos, 0 AS total_gastos
        FROM ingresos i WHERE 1=1 ${whereRango('i', desde, hasta)} ${unidadFiltro?`AND i.unidad_negocio_id=${unidadFiltro}`:''}
        UNION ALL
        SELECT DATE_TRUNC('month', fecha), 0, total_mxn
        FROM gastos g WHERE 1=1 ${whereRango('g', desde, hasta)} ${unidadFiltro?`AND g.unidad_negocio_id=${unidadFiltro}`:''}
      ) t
      GROUP BY fecha_mes
      ORDER BY fecha_mes
    `;

    // ── Por unidad de negocio ──────────────────────────────
    const porUnidadSQL = `
      SELECT
        un.id, un.codigo, un.nombre,
        COALESCE(SUM(i.total_mxn), 0)   AS ingresos,
        COALESCE(SUM(g.total_mxn), 0)   AS gastos,
        COALESCE(SUM(i.total_mxn), 0) - COALESCE(SUM(g.total_mxn), 0) AS utilidad
      FROM unidades_negocio un
      LEFT JOIN ingresos i ON i.unidad_negocio_id = un.id ${whereRango('i', desde, hasta)}
      LEFT JOIN gastos   g ON g.unidad_negocio_id = un.id ${whereRango('g', desde, hasta)}
      GROUP BY un.id, un.codigo, un.nombre
      ORDER BY un.codigo
    `;

    const [ingresos, gastos, consolidado, gastosTot, tendencia, porUnidad] = await Promise.all([
      query(ingresosSQL),
      query(gastosSQL),
      query(consolidadoSQL),
      query(gastosTotSQL),
      query(tendenciaSQL),
      query(porUnidadSQL),
    ]);

    const cons = { ...consolidado.rows[0], ...gastosTot.rows[0] };
    const utilidadBruta = parseFloat(cons.total_ingresos||0) - parseFloat(cons.costos_directos||0) - parseFloat(cons.costo_mano_obra||0);
    const utilidadOperacion = utilidadBruta - parseFloat(cons.gastos_operacion||0);
    const margenBruto = cons.total_ingresos > 0 ? (utilidadBruta / cons.total_ingresos * 100).toFixed(1) : 0;
    const margenOperacion = cons.total_ingresos > 0 ? (utilidadOperacion / cons.total_ingresos * 100).toFixed(1) : 0;

    return res.json({
      ok: true,
      filtros: { desde, hasta, unidad_id: unidadFiltro },
      consolidado: { ...cons, utilidad_bruta: utilidadBruta, utilidad_operacion: utilidadOperacion, margen_bruto: margenBruto, margen_operacion: margenOperacion },
      ingresos_por_tipo:      ingresos.rows,
      gastos_por_categoria:   gastos.rows,
      tendencia_mensual:      tendencia.rows,
      por_unidad:             porUnidad.rows,
    });
  } catch (err) {
    logger.error('Error en estado de resultados:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/rentabilidad-proyectos
// ════════════════════════════════════════════════════════════
const rentabilidadProyectos = async (req, res) => {
  try {
    const { unidad_id, estado, desde, hasta, page=1, limit=30 } = req.query;
    const offset = (page-1)*limit;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;
    if (estado)       { where += ` AND p.estado = $${idx++}`;             params.push(estado); }
    if (unidadFiltro) { where += ` AND p.unidad_negocio_id = $${idx++}`;  params.push(unidadFiltro); }
    if (desde)        { where += ` AND p.fecha_inicio >= $${idx++}`;      params.push(desde); }
    if (hasta)        { where += ` AND p.fecha_fin_estimada <= $${idx++}`;params.push(hasta); }

    const sql = `
      SELECT
        p.id, p.folio, p.nombre, p.estado, p.avance_porcentaje,
        p.presupuesto_global, p.presupuesto_global_mxn,
        p.moneda, p.fecha_inicio, p.fecha_fin_estimada,
        un.codigo                                        AS unidad_codigo,
        c.nombre                                         AS cliente_nombre,
        u.nombre                                         AS responsable_nombre,
        -- Ingresos del proyecto
        COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) AS ingresos_mxn,
        COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id AND i.estado_cobro = 'Cobrado'), 0) AS cobrado_mxn,
        -- Gastos del proyecto
        COALESCE((SELECT SUM(g.total_mxn) FROM gastos g WHERE g.proyecto_id = p.id), 0) AS gastos_mxn,
        COALESCE((SELECT SUM(g.total_mxn) FROM gastos g WHERE g.proyecto_id = p.id AND g.estado_pago = 'Pendiente'), 0) AS gastos_pendientes_mxn,
        -- Presupuesto consumido
        COALESCE((SELECT SUM(ppf.consumido) FROM proyecto_presupuesto_familias ppf WHERE ppf.proyecto_id = p.id), 0) AS presupuesto_consumido,
        -- Utilidad y margen calculados
        COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) -
        COALESCE((SELECT SUM(g.total_mxn) FROM gastos g WHERE g.proyecto_id = p.id), 0) AS utilidad_mxn,
        CASE
          WHEN COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) > 0
          THEN ROUND(
            (COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) -
             COALESCE((SELECT SUM(g.total_mxn) FROM gastos g WHERE g.proyecto_id = p.id), 0)) /
            COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) * 100, 1)
          ELSE 0
        END AS margen_pct,
        -- % del presupuesto consumido
        CASE WHEN p.presupuesto_global_mxn > 0
          THEN ROUND(
            COALESCE((SELECT SUM(ppf.consumido) FROM proyecto_presupuesto_familias ppf WHERE ppf.proyecto_id = p.id), 0)
            / p.presupuesto_global_mxn * 100, 1)
          ELSE 0
        END AS pct_presupuesto_consumido
      FROM proyectos p
      JOIN unidades_negocio un ON p.unidad_negocio_id = un.id
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN usuarios u ON p.responsable_id = u.id
      ${where}
      ORDER BY utilidad_mxn DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const total = parseInt((await query(
      `SELECT COUNT(*) FROM proyectos p ${where}`,
      params.slice(0, -2)
    )).rows[0].count);

    const result = await query(sql, params);

    // Totales del filtro
    const totSQL = `
      SELECT
        COALESCE(SUM(i_total.ingresos), 0) AS ingresos_total,
        COALESCE(SUM(g_total.gastos), 0)   AS gastos_total,
        COALESCE(SUM(i_total.ingresos), 0) - COALESCE(SUM(g_total.gastos), 0) AS utilidad_total
      FROM proyectos p
      LEFT JOIN LATERAL (SELECT COALESCE(SUM(i.total_mxn),0) AS ingresos FROM ingresos i WHERE i.proyecto_id=p.id) i_total ON true
      LEFT JOIN LATERAL (SELECT COALESCE(SUM(g.total_mxn),0) AS gastos  FROM gastos  g WHERE g.proyecto_id=p.id) g_total ON true
      ${where}
    `;
    const tots = await query(totSQL, params.slice(0,-2));

    return res.json({ ok:true, total, pagina:parseInt(page), totales: tots.rows[0], datos: result.rows });
  } catch (err) {
    logger.error('Error en rentabilidad proyectos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/flujo-efectivo
// ════════════════════════════════════════════════════════════
const flujoEfectivo = async (req, res) => {
  try {
    const { desde, hasta, unidad_id } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    // Cobros del periodo (entradas reales de efectivo)
    const cobrosSQL = `
      SELECT
        co.fecha,
        co.forma_pago,
        co.moneda,
        co.monto,
        co.monto_mxn,
        i.folio_interno,
        i.concepto,
        c.nombre AS cliente_nombre,
        un.codigo AS unidad_codigo,
        cb.banco, cb.nombre_cuenta,
        cc.nombre AS cartera_nombre
      FROM cobros co
      JOIN ingresos i ON co.ingreso_id = i.id
      JOIN unidades_negocio un ON i.unidad_negocio_id = un.id
      LEFT JOIN clientes c ON i.cliente_id = c.id
      LEFT JOIN cuentas_bancarias cb ON co.cuenta_bancaria_id = cb.id
      LEFT JOIN carteras_cripto cc ON co.cartera_cripto_id = cc.id
      WHERE 1=1
        ${desde ? `AND co.fecha >= '${desde}'` : ''}
        ${hasta ? `AND co.fecha <= '${hasta}'` : ''}
        ${unidadFiltro ? `AND i.unidad_negocio_id = ${unidadFiltro}` : ''}
      ORDER BY co.fecha
    `;

    // Pagos del periodo (salidas reales de efectivo)
    const pagosSQL = `
      SELECT
        pg.fecha,
        pg.forma_pago,
        pg.moneda,
        pg.monto,
        pg.monto_mxn,
        g.folio_interno,
        g.concepto,
        g.categoria,
        pv.nombre AS proveedor_nombre,
        un.codigo AS unidad_codigo,
        cb.banco, cb.nombre_cuenta,
        cc.nombre AS cartera_nombre
      FROM pagos_gasto pg
      JOIN gastos g ON pg.gasto_id = g.id
      JOIN unidades_negocio un ON g.unidad_negocio_id = un.id
      LEFT JOIN proveedores pv ON g.proveedor_id = pv.id
      LEFT JOIN cuentas_bancarias cb ON pg.cuenta_bancaria_id = cb.id
      LEFT JOIN carteras_cripto cc ON pg.cartera_cripto_id = cc.id
      WHERE 1=1
        ${desde ? `AND pg.fecha >= '${desde}'` : ''}
        ${hasta ? `AND pg.fecha <= '${hasta}'` : ''}
        ${unidadFiltro ? `AND g.unidad_negocio_id = ${unidadFiltro}` : ''}
      ORDER BY pg.fecha
    `;

    // Resumen por moneda
    const resumenSQL = `
      SELECT moneda,
        SUM(entradas) AS entradas,
        SUM(salidas)  AS salidas,
        SUM(entradas) - SUM(salidas) AS neto
      FROM (
        SELECT co.moneda, co.monto AS entradas, 0 AS salidas
        FROM cobros co JOIN ingresos i ON co.ingreso_id=i.id
        WHERE 1=1 ${desde?`AND co.fecha>='${desde}'`:''} ${hasta?`AND co.fecha<='${hasta}'`:''}
        ${unidadFiltro?`AND i.unidad_negocio_id=${unidadFiltro}`:''}
        UNION ALL
        SELECT pg.moneda, 0, pg.monto
        FROM pagos_gasto pg JOIN gastos g ON pg.gasto_id=g.id
        WHERE 1=1 ${desde?`AND pg.fecha>='${desde}'`:''} ${hasta?`AND pg.fecha<='${hasta}'`:''}
        ${unidadFiltro?`AND g.unidad_negocio_id=${unidadFiltro}`:''}
      ) t
      GROUP BY moneda ORDER BY moneda
    `;

    // Flujo mensual
    const mensualSQL = `
      SELECT periodo,
        SUM(entradas_mxn) AS entradas_mxn,
        SUM(salidas_mxn)  AS salidas_mxn,
        SUM(entradas_mxn) - SUM(salidas_mxn) AS neto_mxn
      FROM (
        SELECT TO_CHAR(co.fecha,'YYYY-MM') AS periodo, co.monto_mxn AS entradas_mxn, 0 AS salidas_mxn
        FROM cobros co JOIN ingresos i ON co.ingreso_id=i.id
        WHERE 1=1 ${desde?`AND co.fecha>='${desde}'`:''} ${hasta?`AND co.fecha<='${hasta}'`:''}
        ${unidadFiltro?`AND i.unidad_negocio_id=${unidadFiltro}`:''}
        UNION ALL
        SELECT TO_CHAR(pg.fecha,'YYYY-MM'), 0, pg.monto_mxn
        FROM pagos_gasto pg JOIN gastos g ON pg.gasto_id=g.id
        WHERE 1=1 ${desde?`AND pg.fecha>='${desde}'`:''} ${hasta?`AND pg.fecha<='${hasta}'`:''}
        ${unidadFiltro?`AND g.unidad_negocio_id=${unidadFiltro}`:''}
      ) t
      GROUP BY periodo ORDER BY periodo
    `;

    const [cobros, pagos, resumen, mensual] = await Promise.all([
      query(cobrosSQL), query(pagosSQL), query(resumenSQL), query(mensualSQL),
    ]);

    const totalEntradas = cobros.rows.reduce((a,r)=>a+parseFloat(r.monto_mxn||0),0);
    const totalSalidas  = pagos.rows.reduce((a,r)=>a+parseFloat(r.monto_mxn||0),0);

    return res.json({
      ok: true,
      filtros: { desde, hasta, unidad_id: unidadFiltro },
      resumen_totales: { entradas_mxn: totalEntradas, salidas_mxn: totalSalidas, neto_mxn: totalEntradas-totalSalidas },
      por_moneda:   resumen.rows,
      flujo_mensual: mensual.rows,
      cobros:        cobros.rows,
      pagos:         pagos.rows,
    });
  } catch (err) {
    logger.error('Error en flujo de efectivo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/cuentas-por-cobrar
// ════════════════════════════════════════════════════════════
const cuentasPorCobrar = async (req, res) => {
  try {
    const { unidad_id, cliente_id } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    const sql = `
      SELECT
        i.id, i.folio_interno, i.fecha, i.concepto, i.tipo,
        i.moneda, i.total, i.total_mxn,
        COALESCE((SELECT SUM(co.monto_mxn) FROM cobros co WHERE co.ingreso_id=i.id),0) AS cobrado_mxn,
        i.total_mxn - COALESCE((SELECT SUM(co.monto_mxn) FROM cobros co WHERE co.ingreso_id=i.id),0) AS pendiente_mxn,
        i.estado_cobro,
        c.nombre AS cliente_nombre,
        p.folio  AS proyecto_folio,
        un.codigo AS unidad_codigo,
        -- Días vencido (usando fecha del ingreso como vencimiento estimado)
        CURRENT_DATE - i.fecha::date AS dias_antigüedad
      FROM ingresos i
      JOIN unidades_negocio un ON i.unidad_negocio_id = un.id
      LEFT JOIN clientes c ON i.cliente_id = c.id
      LEFT JOIN proyectos p ON i.proyecto_id = p.id
      WHERE i.estado_cobro != 'Cobrado'
        ${unidadFiltro ? `AND i.unidad_negocio_id = ${unidadFiltro}` : ''}
        ${cliente_id ? `AND i.cliente_id = ${cliente_id}` : ''}
      ORDER BY dias_antigüedad DESC
    `;

    const result = await query(sql);
    const total_pendiente = result.rows.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0);

    // Antigüedad por tramo
    const antigüedad = {
      corriente:   result.rows.filter(r=>r['dias_antigüedad']<=30),
      dias_31_60:  result.rows.filter(r=>r['dias_antigüedad']>30 && r['dias_antigüedad']<=60),
      dias_61_90:  result.rows.filter(r=>r['dias_antigüedad']>60 && r['dias_antigüedad']<=90),
      mas_90:      result.rows.filter(r=>r['dias_antigüedad']>90),
    };

    return res.json({ ok:true, total_pendiente_mxn: total_pendiente, antigüedad_resumen: {
      corriente:  { count: antigüedad.corriente.length,  monto: antigüedad.corriente.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0) },
      dias_31_60: { count: antigüedad.dias_31_60.length, monto: antigüedad.dias_31_60.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0) },
      dias_61_90: { count: antigüedad.dias_61_90.length, monto: antigüedad.dias_61_90.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0) },
      mas_90:     { count: antigüedad.mas_90.length,     monto: antigüedad.mas_90.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0) },
    }, datos: result.rows });
  } catch (err) {
    logger.error('Error en cuentas por cobrar:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/cuentas-por-pagar
// ════════════════════════════════════════════════════════════
const cuentasPorPagar = async (req, res) => {
  try {
    const { unidad_id, proveedor_id } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    const sql = `
      SELECT
        g.id, g.folio_interno, g.fecha, g.concepto, g.categoria,
        g.moneda, g.total, g.total_mxn,
        COALESCE((SELECT SUM(pg.monto_mxn) FROM pagos_gasto pg WHERE pg.gasto_id=g.id),0) AS pagado_mxn,
        g.total_mxn - COALESCE((SELECT SUM(pg.monto_mxn) FROM pagos_gasto pg WHERE pg.gasto_id=g.id),0) AS pendiente_mxn,
        g.estado_pago, g.comprobante_tipo,
        pv.nombre AS proveedor_nombre,
        p.folio   AS proyecto_folio,
        un.codigo AS unidad_codigo,
        CURRENT_DATE - g.fecha::date AS dias_antigüedad
      FROM gastos g
      JOIN unidades_negocio un ON g.unidad_negocio_id = un.id
      LEFT JOIN proveedores pv ON g.proveedor_id = pv.id
      LEFT JOIN proyectos p ON g.proyecto_id = p.id
      WHERE g.estado_pago = 'Pendiente'
        ${unidadFiltro ? `AND g.unidad_negocio_id = ${unidadFiltro}` : ''}
        ${proveedor_id ? `AND g.proveedor_id = ${proveedor_id}` : ''}
      ORDER BY dias_antigüedad DESC
    `;

    const result = await query(sql);
    const total_pendiente = result.rows.reduce((a,r)=>a+parseFloat(r.pendiente_mxn||0),0);

    return res.json({ ok:true, total_pendiente_mxn: total_pendiente, datos: result.rows });
  } catch (err) {
    logger.error('Error en cuentas por pagar:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/reportes/dashboard-financiero
// KPIs consolidados para el dashboard principal
// ════════════════════════════════════════════════════════════
const dashboardFinanciero = async (req, res) => {
  try {
    const { unidad_id } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;
    const u = unidadFiltro ? `AND unidad_negocio_id = ${unidadFiltro}` : '';

    const anioActual = new Date().getFullYear();
    const mesActual  = new Date().getMonth() + 1;
    const inicioAnio = `${anioActual}-01-01`;
    const inicioMes  = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`;

    const [kpisMes, kpisAnio, topProyectos, ivaActual] = await Promise.all([
      // KPIs del mes
      query(`
        SELECT
          COALESCE((SELECT SUM(total_mxn) FROM ingresos WHERE fecha >= $1 ${u}), 0) AS ingresos_mes,
          COALESCE((SELECT SUM(total_mxn) FROM gastos   WHERE fecha >= $1 ${u}), 0) AS gastos_mes,
          COALESCE((SELECT SUM(monto_mxn) FROM cobros co JOIN ingresos i ON co.ingreso_id=i.id WHERE co.fecha >= $1 ${u.replace('unidad_negocio_id','i.unidad_negocio_id')}), 0) AS cobrado_mes,
          COALESCE((SELECT SUM(monto_mxn) FROM pagos_gasto pg JOIN gastos g ON pg.gasto_id=g.id WHERE pg.fecha >= $1 ${u.replace('unidad_negocio_id','g.unidad_negocio_id')}), 0) AS pagado_mes
        FROM (SELECT 1) t
      `, [inicioMes]),
      // KPIs del año
      query(`
        SELECT
          COALESCE((SELECT SUM(total_mxn) FROM ingresos WHERE fecha >= $1 ${u}), 0) AS ingresos_anio,
          COALESCE((SELECT SUM(total_mxn) FROM gastos   WHERE fecha >= $1 ${u}), 0) AS gastos_anio
        FROM (SELECT 1) t
      `, [inicioAnio]),
      // Top 5 proyectos por utilidad
      query(`
        SELECT p.folio, p.nombre, un.codigo AS unidad,
          COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id=p.id),0) AS ingresos,
          COALESCE((SELECT SUM(g.total_mxn) FROM gastos   g WHERE g.proyecto_id=p.id),0) AS gastos,
          COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id=p.id),0) -
          COALESCE((SELECT SUM(g.total_mxn) FROM gastos   g WHERE g.proyecto_id=p.id),0) AS utilidad
        FROM proyectos p
        JOIN unidades_negocio un ON p.unidad_negocio_id=un.id
        WHERE p.estado='Activo' ${unidadFiltro?`AND p.unidad_negocio_id=${unidadFiltro}`:''}
        ORDER BY utilidad DESC LIMIT 5
      `),
      // IVA mes actual
      query(`
        SELECT iva_trasladado, iva_acreditable, iva_neto
        FROM periodos_iva WHERE anio=$1 AND mes=$2
      `, [anioActual, mesActual]),
    ]);

    const mes   = kpisMes.rows[0];
    const anio  = kpisAnio.rows[0];
    const iva   = ivaActual.rows[0] || { iva_trasladado:0, iva_acreditable:0, iva_neto:0 };

    return res.json({
      ok: true,
      mes: {
        ingresos: mes.ingresos_mes,
        gastos:   mes.gastos_mes,
        utilidad: parseFloat(mes.ingresos_mes) - parseFloat(mes.gastos_mes),
        cobrado:  mes.cobrado_mes,
        pagado:   mes.pagado_mes,
      },
      anio: {
        ingresos:  anio.ingresos_anio,
        gastos:    anio.gastos_anio,
        utilidad:  parseFloat(anio.ingresos_anio) - parseFloat(anio.gastos_anio),
        margen:    anio.ingresos_anio > 0
          ? ((parseFloat(anio.ingresos_anio) - parseFloat(anio.gastos_anio)) / parseFloat(anio.ingresos_anio) * 100).toFixed(1)
          : 0,
      },
      iva_mes: iva,
      top_proyectos: topProyectos.rows,
    });
  } catch (err) {
    logger.error('Error en dashboard financiero:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  estadoResultados, rentabilidadProyectos,
  flujoEfectivo, cuentasPorCobrar, cuentasPorPagar,
  dashboardFinanciero,
};
