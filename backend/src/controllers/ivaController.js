const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ════════════════════════════════════════════════════════════
// GET /api/iva/periodos  — Histórico de IVA por mes
// ════════════════════════════════════════════════════════════
const listarPeriodos = async (req, res) => {
  try {
    const { anio } = req.query;
    let sql = `
      SELECT pi.*,
        u.nombre AS cerrado_por_nombre
      FROM periodos_iva pi
      LEFT JOIN usuarios u ON pi.cerrado_por = u.id
      WHERE 1=1
    `;
    const params = [];
    if (anio) { sql += ` AND pi.anio = $1`; params.push(parseInt(anio)); }
    sql += ' ORDER BY pi.anio DESC, pi.mes DESC';

    const result = await query(sql, params);
    return res.json({ ok:true, datos: result.rows });
  } catch (err) {
    logger.error('Error listando periodos IVA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/iva/periodo/:anio/:mes  — Detalle de un periodo
// ════════════════════════════════════════════════════════════
const detallePeriodo = async (req, res) => {
  try {
    const { anio, mes } = req.params;

    // Recalcular en tiempo real
    await query('SELECT recalcular_periodo_iva($1,$2)', [parseInt(anio), parseInt(mes)]);

    // Obtener periodo
    const periodoRes = await query(
      'SELECT * FROM periodos_iva WHERE anio=$1 AND mes=$2',
      [parseInt(anio), parseInt(mes)]
    );

    // Ingresos con IVA del periodo
    const ingresosRes = await query(`
      SELECT i.folio_interno, i.fecha, i.concepto, i.tipo, i.moneda,
        i.subtotal_mxn, i.iva_mxn, i.total_mxn,
        c.nombre AS cliente_nombre, p.folio AS proyecto_folio,
        un.codigo AS unidad_codigo
      FROM ingresos i
      LEFT JOIN clientes c ON i.cliente_id=c.id
      LEFT JOIN proyectos p ON i.proyecto_id=p.id
      LEFT JOIN unidades_negocio un ON i.unidad_negocio_id=un.id
      WHERE EXTRACT(YEAR FROM i.fecha)::INTEGER = $1
        AND EXTRACT(MONTH FROM i.fecha)::INTEGER = $2
        AND i.iva_mxn > 0
      ORDER BY i.fecha, i.id
    `, [parseInt(anio), parseInt(mes)]);

    // Gastos con IVA acreditable del periodo (solo facturas)
    const gastosRes = await query(`
      SELECT g.folio_interno, g.fecha, g.concepto, g.categoria,
        g.moneda, g.subtotal_mxn, g.iva_mxn AS iva_acreditable, g.total_mxn,
        g.comprobante_tipo, g.comprobante_folio,
        pv.nombre AS proveedor_nombre, p.folio AS proyecto_folio,
        un.codigo AS unidad_codigo
      FROM gastos g
      LEFT JOIN proveedores pv ON g.proveedor_id=pv.id
      LEFT JOIN proyectos p ON g.proyecto_id=p.id
      LEFT JOIN unidades_negocio un ON g.unidad_negocio_id=un.id
      WHERE EXTRACT(YEAR FROM g.fecha)::INTEGER = $1
        AND EXTRACT(MONTH FROM g.fecha)::INTEGER = $2
        AND g.comprobante_tipo = 'Factura'
        AND g.iva_mxn > 0
      ORDER BY g.fecha, g.id
    `, [parseInt(anio), parseInt(mes)]);

    // Resumen por unidad de negocio
    const porUnidadRes = await query(`
      SELECT un.codigo, un.nombre,
        COALESCE(SUM(i.iva_mxn),0) AS iva_trasladado,
        COALESCE((
          SELECT SUM(g2.iva_mxn) FROM gastos g2
          WHERE g2.unidad_negocio_id=un.id
            AND EXTRACT(YEAR FROM g2.fecha)::INTEGER=$1
            AND EXTRACT(MONTH FROM g2.fecha)::INTEGER=$2
            AND g2.comprobante_tipo='Factura'
        ),0) AS iva_acreditable
      FROM unidades_negocio un
      LEFT JOIN ingresos i ON i.unidad_negocio_id=un.id
        AND EXTRACT(YEAR FROM i.fecha)::INTEGER=$1
        AND EXTRACT(MONTH FROM i.fecha)::INTEGER=$2
      GROUP BY un.id, un.codigo, un.nombre
      ORDER BY un.codigo
    `, [parseInt(anio), parseInt(mes)]);

    const periodo = periodoRes.rows[0] || {
      anio: parseInt(anio), mes: parseInt(mes),
      iva_trasladado: 0, iva_acreditable: 0, iva_neto: 0, estado:'Abierto'
    };

    return res.json({
      ok: true,
      periodo,
      ingresos_con_iva:   ingresosRes.rows,
      gastos_acreditables: gastosRes.rows,
      por_unidad:          porUnidadRes.rows,
      totales: {
        iva_trasladado:  periodo.iva_trasladado,
        iva_acreditable: periodo.iva_acreditable,
        iva_neto:        periodo.iva_neto,
        a_pagar:         Math.max(0, parseFloat(periodo.iva_neto||0)),
        a_favor:         Math.abs(Math.min(0, parseFloat(periodo.iva_neto||0))),
      }
    });
  } catch (err) {
    logger.error('Error en detalle periodo IVA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/iva/periodo/:anio/:mes/cerrar
// ════════════════════════════════════════════════════════════
const cerrarPeriodo = async (req, res) => {
  const { anio, mes } = req.params;
  try {
    // Recalcular antes de cerrar
    await query('SELECT recalcular_periodo_iva($1,$2)', [parseInt(anio), parseInt(mes)]);

    await query(`
      UPDATE periodos_iva SET estado='Cerrado', cerrado_en=NOW(), cerrado_por=$1
      WHERE anio=$2 AND mes=$3
    `, [req.usuario.id, parseInt(anio), parseInt(mes)]);

    logger.info('Periodo IVA cerrado', { anio, mes, por: req.usuario.email });
    return res.json({ ok:true, message:`Periodo ${mes}/${anio} cerrado correctamente` });
  } catch (err) {
    logger.error('Error cerrando periodo IVA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/iva/resumen-anual  — IVA de todo el año
// ════════════════════════════════════════════════════════════
const resumenAnual = async (req, res) => {
  try {
    const anio = parseInt(req.query.anio || new Date().getFullYear());

    // Recalcular todos los meses del año
    for (let m = 1; m <= 12; m++) {
      await query('SELECT recalcular_periodo_iva($1,$2)', [anio, m]);
    }

    const result = await query(`
      SELECT mes,
        iva_trasladado, iva_acreditable, iva_neto,
        estado,
        CASE WHEN iva_neto > 0 THEN iva_neto ELSE 0 END AS a_pagar,
        CASE WHEN iva_neto < 0 THEN ABS(iva_neto) ELSE 0 END AS a_favor
      FROM periodos_iva
      WHERE anio = $1
      ORDER BY mes
    `, [anio]);

    const acumulado = result.rows.reduce((acc, r) => ({
      trasladado:  acc.trasladado  + parseFloat(r.iva_trasladado),
      acreditable: acc.acreditable + parseFloat(r.iva_acreditable),
      neto:        acc.neto        + parseFloat(r.iva_neto),
    }), { trasladado:0, acreditable:0, neto:0 });

    return res.json({ ok:true, anio, meses: result.rows, acumulado });
  } catch (err) {
    logger.error('Error en resumen anual IVA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listarPeriodos, detallePeriodo, cerrarPeriodo, resumenAnual };
