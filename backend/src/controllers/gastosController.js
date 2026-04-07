const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

const generarFolioGasto = async (client, unidadCodigo) => {
  const anio = new Date().getFullYear();
  const res  = await client.query(`
    SELECT COUNT(*)+1 AS n FROM gastos g
    JOIN unidades_negocio u ON g.unidad_negocio_id = u.id
    WHERE u.codigo = $1 AND EXTRACT(YEAR FROM g.fecha) = $2
  `, [unidadCodigo, anio]);
  return `GAS-${unidadCodigo}-${anio}-${String(res.rows[0].n).padStart(4,'0')}`;
};

const calcMXN = (v, tc) => parseFloat((parseFloat(v) * parseFloat(tc)).toFixed(2));

// ════════════════════════════════════════════════════════════
// GET /api/gastos
// ════════════════════════════════════════════════════════════
const listar = async (req, res) => {
  try {
    const { proyecto_id, proveedor_id, unidad_id, estado_pago, categoria,
            comprobante_tipo, moneda, familia_id, desde, hasta, search, page=1, limit=30 } = req.query;
    const offset = (page-1)*limit;

    let sql = `
      SELECT g.*,
        pv.nombre  AS proveedor_nombre,
        p.folio    AS proyecto_folio,
        un.codigo  AS unidad_codigo,
        fpc.nombre AS familia_nombre,
        u.nombre   AS creado_por_nombre
      FROM gastos g
      LEFT JOIN proveedores              pv  ON g.proveedor_id          = pv.id
      LEFT JOIN proyectos                p   ON g.proyecto_id           = p.id
      LEFT JOIN unidades_negocio         un  ON g.unidad_negocio_id     = un.id
      LEFT JOIN familias_presupuesto_catalogo fpc ON g.familia_presupuesto_id = fpc.id
      LEFT JOIN usuarios                 u   ON g.creado_por            = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (proyecto_id)      { sql += ` AND g.proyecto_id = $${idx++}`;            params.push(proyecto_id); }
    if (proveedor_id)     { sql += ` AND g.proveedor_id = $${idx++}`;           params.push(proveedor_id); }
    if (unidad_id)        { sql += ` AND g.unidad_negocio_id = $${idx++}`;      params.push(unidad_id); }
    if (estado_pago)      { sql += ` AND g.estado_pago = $${idx++}`;            params.push(estado_pago); }
    if (categoria)        { sql += ` AND g.categoria = $${idx++}`;              params.push(categoria); }
    if (comprobante_tipo) { sql += ` AND g.comprobante_tipo = $${idx++}`;       params.push(comprobante_tipo); }
    if (moneda)           { sql += ` AND g.moneda = $${idx++}`;                 params.push(moneda); }
    if (familia_id)       { sql += ` AND g.familia_presupuesto_id = $${idx++}`; params.push(familia_id); }
    if (desde)            { sql += ` AND g.fecha >= $${idx++}`;                 params.push(desde); }
    if (hasta)            { sql += ` AND g.fecha <= $${idx++}`;                 params.push(hasta); }
    if (search) {
      sql += ` AND (g.folio_interno ILIKE $${idx} OR g.concepto ILIKE $${idx} OR pv.nombre ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND g.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);

    const totalesRes = await query(`
      SELECT
        COALESCE(SUM(subtotal_mxn),0)                                                  AS subtotal_total,
        COALESCE(SUM(iva_mxn),0)                                                       AS iva_acreditable_total,
        COALESCE(SUM(total_mxn),0)                                                     AS total_total,
        COALESCE(SUM(total_mxn) FILTER (WHERE estado_pago='Pagado'),0)                AS pagado_total,
        COALESCE(SUM(total_mxn) FILTER (WHERE estado_pago='Pendiente'),0)             AS pendiente_total,
        COALESCE(SUM(iva_mxn)   FILTER (WHERE comprobante_tipo='Factura'),0)           AS iva_acreditable_facturas
      FROM (${sql}) t
    `, params);

    sql += ` ORDER BY g.fecha DESC, g.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok:true, total, pagina: parseInt(page), totales: totalesRes.rows[0], datos: result.rows });
  } catch (err) {
    logger.error('Error listando gastos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/gastos/:id
// ════════════════════════════════════════════════════════════
const obtener = async (req, res) => {
  try {
    const gasRes = await query(`
      SELECT g.*,
        pv.nombre AS proveedor_nombre, pv.rfc AS proveedor_rfc,
        p.folio AS proyecto_folio, p.nombre AS proyecto_nombre,
        un.codigo AS unidad_codigo,
        fpc.nombre AS familia_nombre
      FROM gastos g
      LEFT JOIN proveedores pv ON g.proveedor_id=pv.id
      LEFT JOIN proyectos p ON g.proyecto_id=p.id
      LEFT JOIN unidades_negocio un ON g.unidad_negocio_id=un.id
      LEFT JOIN familias_presupuesto_catalogo fpc ON g.familia_presupuesto_id=fpc.id
      WHERE g.id=$1
    `, [req.params.id]);

    if (!gasRes.rows.length) return res.status(404).json({ error: 'Gasto no encontrado' });

    const [partidasRes, pagosRes] = await Promise.all([
      query('SELECT * FROM gasto_partidas WHERE gasto_id=$1 ORDER BY numero_partida', [req.params.id]),
      query(`
        SELECT pg.*, cb.banco, cb.nombre_cuenta, cc.nombre AS cartera_nombre,
          u.nombre AS creado_por_nombre
        FROM pagos_gasto pg
        LEFT JOIN cuentas_bancarias cb ON pg.cuenta_bancaria_id=cb.id
        LEFT JOIN carteras_cripto cc ON pg.cartera_cripto_id=cc.id
        LEFT JOIN usuarios u ON pg.creado_por=u.id
        WHERE pg.gasto_id=$1 ORDER BY pg.fecha
      `, [req.params.id])
    ]);

    return res.json({ ok:true, datos: { ...gasRes.rows[0], partidas: partidasRes.rows, pagos: pagosRes.rows } });
  } catch (err) {
    logger.error('Error obteniendo gasto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/gastos
// ════════════════════════════════════════════════════════════
const crear = async (req, res) => {
  const { proyecto_id, unidad_negocio_id, proveedor_id, familia_presupuesto_id,
          fecha, concepto, categoria, moneda, tipo_cambio, comprobante_tipo,
          comprobante_folio, partidas, notas } = req.body;
  try {
    const resultado = await withTransaction(async (client) => {
      const unidadRes = await client.query('SELECT codigo FROM unidades_negocio WHERE id=$1',[unidad_negocio_id]);
      const unidadCodigo = unidadRes.rows[0]?.codigo || 'GEN';
      const folio = await generarFolioGasto(client, unidadCodigo);
      const tc    = parseFloat(tipo_cambio || 1);
      const esFactura = comprobante_tipo === 'Factura';

      let subtotal = 0, ivaTotal = 0;
      const partidasCalc = (partidas||[]).map((p,i) => {
        const sub  = parseFloat((parseFloat(p.cantidad||1) * parseFloat(p.precio_unitario)).toFixed(2));
        const tiva = parseFloat(p.tasa_iva ?? 16);
        const iva  = (p.aplica_iva !== false && esFactura) ? parseFloat((sub*tiva/100).toFixed(2)) : 0;
        subtotal += sub; ivaTotal += iva;
        return { ...p, num: i+1, sub_p: sub, iva_p: iva, tot_p: parseFloat((sub+iva).toFixed(2)) };
      });

      const total = parseFloat((subtotal + ivaTotal).toFixed(2));

      const gasRes = await client.query(`
        INSERT INTO gastos
          (folio_interno, proyecto_id, unidad_negocio_id, proveedor_id,
           familia_presupuesto_id, fecha, concepto, categoria, moneda,
           subtotal, tasa_iva, iva_acreditable, total,
           tipo_cambio, subtotal_mxn, iva_mxn, total_mxn,
           comprobante_tipo, comprobante_folio, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id, folio_interno
      `, [
        folio, proyecto_id||null, unidad_negocio_id, proveedor_id||null,
        familia_presupuesto_id||null, fecha, concepto, categoria||'Operacion',
        moneda||'MXN', subtotal, req.body.tasa_iva||16, ivaTotal, total,
        tc, calcMXN(subtotal,tc), calcMXN(ivaTotal,tc), calcMXN(total,tc),
        comprobante_tipo||'Sin comprobante', comprobante_folio||null,
        notas||null, req.usuario.id
      ]);

      const gasId = gasRes.rows[0].id;

      for (const p of partidasCalc) {
        await client.query(`
          INSERT INTO gasto_partidas
            (gasto_id, numero_partida, producto_id, descripcion, unidad_medida,
             cantidad, precio_unitario, subtotal, aplica_iva, tasa_iva, iva, total)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [gasId, p.num, p.producto_id||null, p.descripcion, p.unidad_medida||null,
            parseFloat(p.cantidad||1), parseFloat(p.precio_unitario),
            p.sub_p, p.aplica_iva!==false, parseFloat(p.tasa_iva||16), p.iva_p, p.tot_p]);
      }

      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
        VALUES ($1,'gastos',$2,'INSERT',$3,$4)
      `, [req.usuario.id, gasId, JSON.stringify({folio,total,moneda,comprobante_tipo}), req.ip]);

      return { id: gasId, folio, total };
    });

    logger.info('Gasto creado', { folio: resultado.folio });
    return res.status(201).json({ ok:true, message:`Gasto ${resultado.folio} registrado`, datos: resultado });
  } catch (err) {
    logger.error('Error creando gasto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/gastos/:id/pagos
// ════════════════════════════════════════════════════════════
const registrarPago = async (req, res) => {
  const { id } = req.params;
  const { fecha, monto, moneda, tipo_cambio, forma_pago,
          cuenta_bancaria_id, cartera_cripto_id, hash_cripto, referencia, notas } = req.body;
  try {
    const tc = parseFloat(tipo_cambio||1);
    const montoMxn = parseFloat((parseFloat(monto)*tc).toFixed(2));
    const res2 = await query(`
      INSERT INTO pagos_gasto
        (gasto_id, fecha, monto, moneda, tipo_cambio, monto_mxn, forma_pago,
         cuenta_bancaria_id, cartera_cripto_id, hash_cripto, referencia, notas, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [id, fecha, parseFloat(monto), moneda||'MXN', tc, montoMxn,
        forma_pago||null, cuenta_bancaria_id||null, cartera_cripto_id||null,
        hash_cripto||null, referencia||null, notas||null, req.usuario.id]);

    logger.info('Pago de gasto registrado', { gasto_id: id, monto });
    return res.status(201).json({ ok:true, message:'Pago registrado', datos: res2.rows[0] });
  } catch (err) {
    logger.error('Error registrando pago:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/gastos/:id
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { concepto, categoria, fecha, proveedor_id, proyecto_id,
          familia_presupuesto_id, comprobante_tipo, comprobante_folio, notas } = req.body;
  try {
    await query(`
      UPDATE gastos SET
        concepto=COALESCE($1,concepto), categoria=COALESCE($2,categoria),
        fecha=COALESCE($3,fecha), proveedor_id=COALESCE($4,proveedor_id),
        proyecto_id=COALESCE($5,proyecto_id),
        familia_presupuesto_id=COALESCE($6,familia_presupuesto_id),
        comprobante_tipo=COALESCE($7,comprobante_tipo),
        comprobante_folio=COALESCE($8,comprobante_folio),
        notas=$9, actualizado_en=NOW()
      WHERE id=$10
    `, [concepto,categoria,fecha,proveedor_id,proyecto_id,
        familia_presupuesto_id,comprobante_tipo,comprobante_folio,notas,id]);
    return res.json({ ok:true, message:'Gasto actualizado' });
  } catch (err) {
    logger.error('Error actualizando gasto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, registrarPago, actualizar };
