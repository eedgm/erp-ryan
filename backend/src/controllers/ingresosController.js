const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ── Genera folio de ingreso ───────────────────────────────────
const generarFolioIngreso = async (client, unidadCodigo) => {
  const anio = new Date().getFullYear();
  const res  = await client.query(`
    SELECT COUNT(*)+1 AS n FROM ingresos i
    JOIN unidades_negocio u ON i.unidad_negocio_id = u.id
    WHERE u.codigo = $1 AND EXTRACT(YEAR FROM i.fecha) = $2
  `, [unidadCodigo, anio]);
  return `ING-${unidadCodigo}-${anio}-${String(res.rows[0].n).padStart(4,'0')}`;
};

// ── Calcula equivalentes MXN usando TC ───────────────────────
const calcularMXN = (valor, tc) => parseFloat((parseFloat(valor) * parseFloat(tc)).toFixed(2));

// ════════════════════════════════════════════════════════════
// GET /api/ingresos
// ════════════════════════════════════════════════════════════
const listar = async (req, res) => {
  try {
    const { proyecto_id, cliente_id, unidad_id, estado_cobro,
            tipo, moneda, desde, hasta, search, page=1, limit=30 } = req.query;
    const offset = (page-1)*limit;

    let sql = `
      SELECT i.*,
        c.nombre  AS cliente_nombre,
        p.folio   AS proyecto_folio,
        un.codigo AS unidad_codigo,
        u.nombre  AS creado_por_nombre,
        COALESCE((SELECT SUM(co.monto_mxn) FROM cobros co WHERE co.ingreso_id = i.id), 0) AS cobrado_mxn
      FROM ingresos i
      LEFT JOIN clientes          c  ON i.cliente_id        = c.id
      LEFT JOIN proyectos         p  ON i.proyecto_id       = p.id
      LEFT JOIN unidades_negocio  un ON i.unidad_negocio_id = un.id
      LEFT JOIN usuarios          u  ON i.creado_por        = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (proyecto_id)   { sql += ` AND i.proyecto_id = $${idx++}`;            params.push(proyecto_id); }
    if (cliente_id)    { sql += ` AND i.cliente_id = $${idx++}`;             params.push(cliente_id); }
    if (unidad_id)     { sql += ` AND i.unidad_negocio_id = $${idx++}`;      params.push(unidad_id); }
    if (estado_cobro)  { sql += ` AND i.estado_cobro = $${idx++}`;           params.push(estado_cobro); }
    if (tipo)          { sql += ` AND i.tipo = $${idx++}`;                   params.push(tipo); }
    if (moneda)        { sql += ` AND i.moneda = $${idx++}`;                 params.push(moneda); }
    if (desde)         { sql += ` AND i.fecha >= $${idx++}`;                 params.push(desde); }
    if (hasta)         { sql += ` AND i.fecha <= $${idx++}`;                 params.push(hasta); }
    if (search) {
      sql += ` AND (i.folio_interno ILIKE $${idx} OR i.concepto ILIKE $${idx} OR c.nombre ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND i.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);

    // Totales para el header
    const totalesRes = await query(`
      SELECT
        COALESCE(SUM(subtotal_mxn),0) AS subtotal_total,
        COALESCE(SUM(iva_mxn),0)      AS iva_total,
        COALESCE(SUM(total_mxn),0)    AS total_total,
        COALESCE(SUM(total_mxn) FILTER (WHERE estado_cobro='Cobrado'),0)       AS cobrado_total,
        COALESCE(SUM(total_mxn) FILTER (WHERE estado_cobro!='Cobrado'),0)      AS pendiente_total
      FROM (${sql}) t
    `, params);

    sql += ` ORDER BY i.fecha DESC, i.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({
      ok: true, total, pagina: parseInt(page),
      totales: totalesRes.rows[0],
      datos: result.rows
    });
  } catch (err) {
    logger.error('Error listando ingresos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/ingresos/:id
// ════════════════════════════════════════════════════════════
const obtener = async (req, res) => {
  try {
    const ingRes = await query(`
      SELECT i.*,
        c.nombre  AS cliente_nombre, c.rfc AS cliente_rfc,
        p.folio   AS proyecto_folio, p.nombre AS proyecto_nombre,
        un.codigo AS unidad_codigo,
        cb.banco  AS cuenta_banco, cb.nombre_cuenta,
        cc.nombre AS cartera_nombre, cc.moneda AS cartera_moneda
      FROM ingresos i
      LEFT JOIN clientes c ON i.cliente_id=c.id
      LEFT JOIN proyectos p ON i.proyecto_id=p.id
      LEFT JOIN unidades_negocio un ON i.unidad_negocio_id=un.id
      LEFT JOIN cuentas_bancarias cb ON i.cuenta_bancaria_id=cb.id
      LEFT JOIN carteras_cripto cc ON i.cartera_cripto_id=cc.id
      WHERE i.id = $1
    `, [req.params.id]);

    if (!ingRes.rows.length) return res.status(404).json({ error: 'Ingreso no encontrado' });

    const partidasRes = await query(
      'SELECT * FROM ingreso_partidas WHERE ingreso_id=$1 ORDER BY numero_partida',
      [req.params.id]
    );

    const cobrosRes = await query(`
      SELECT co.*, cb.banco, cb.nombre_cuenta, cc.nombre AS cartera_nombre,
        u.nombre AS creado_por_nombre
      FROM cobros co
      LEFT JOIN cuentas_bancarias cb ON co.cuenta_bancaria_id=cb.id
      LEFT JOIN carteras_cripto cc ON co.cartera_cripto_id=cc.id
      LEFT JOIN usuarios u ON co.creado_por=u.id
      WHERE co.ingreso_id=$1 ORDER BY co.fecha
    `, [req.params.id]);

    return res.json({ ok: true, datos: { ...ingRes.rows[0], partidas: partidasRes.rows, cobros: cobrosRes.rows } });
  } catch (err) {
    logger.error('Error obteniendo ingreso:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ingresos
// ════════════════════════════════════════════════════════════
const crear = async (req, res) => {
  const { proyecto_id, unidad_negocio_id, cliente_id, fecha, concepto,
          tipo, moneda, tipo_cambio, partidas, cuenta_bancaria_id,
          cartera_cripto_id, referencia_externa, notas } = req.body;

  try {
    const resultado = await withTransaction(async (client) => {
      const unidadRes = await client.query(
        'SELECT codigo FROM unidades_negocio WHERE id=$1', [unidad_negocio_id]
      );
      const unidadCodigo = unidadRes.rows[0]?.codigo || 'GEN';
      const folio = await generarFolioIngreso(client, unidadCodigo);
      const tc    = parseFloat(tipo_cambio || 1);

      // Calcular totales desde partidas
      let subtotal = 0, ivaTotal = 0;
      const partidasCalc = (partidas || []).map((p, i) => {
        const qty   = parseFloat(p.cantidad || 1);
        const price = parseFloat(p.precio_unitario);
        const desc  = parseFloat(p.descuento_pct || 0);
        const sub   = parseFloat((qty * price * (1 - desc/100)).toFixed(2));
        const tiva  = parseFloat(p.tasa_iva ?? 16);
        const iva   = p.aplica_iva !== false ? parseFloat((sub * tiva/100).toFixed(2)) : 0;
        subtotal += sub;
        ivaTotal += iva;
        return { ...p, numero: i+1, subtotal_p: sub, iva_p: iva, total_p: parseFloat((sub+iva).toFixed(2)) };
      });

      const total = parseFloat((subtotal + ivaTotal).toFixed(2));

      const ingRes = await client.query(`
        INSERT INTO ingresos
          (folio_interno, proyecto_id, unidad_negocio_id, cliente_id, fecha,
           concepto, tipo, moneda, subtotal, tasa_iva, iva, total,
           tipo_cambio, subtotal_mxn, iva_mxn, total_mxn,
           cuenta_bancaria_id, cartera_cripto_id, referencia_externa, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id, folio_interno
      `, [
        folio, proyecto_id||null, unidad_negocio_id, cliente_id||null, fecha,
        concepto, tipo||'Venta Servicio', moneda||'MXN',
        subtotal, req.body.tasa_iva||16, ivaTotal, total,
        tc, calcularMXN(subtotal,tc), calcularMXN(ivaTotal,tc), calcularMXN(total,tc),
        cuenta_bancaria_id||null, cartera_cripto_id||null,
        referencia_externa||null, notas||null, req.usuario.id
      ]);

      const ingId = ingRes.rows[0].id;

      for (const p of partidasCalc) {
        await client.query(`
          INSERT INTO ingreso_partidas
            (ingreso_id, numero_partida, producto_id, descripcion, unidad_medida,
             cantidad, precio_unitario, descuento_pct, subtotal, aplica_iva, tasa_iva, iva, total)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [ingId, p.numero, p.producto_id||null, p.descripcion, p.unidad_medida||null,
            parseFloat(p.cantidad||1), parseFloat(p.precio_unitario),
            parseFloat(p.descuento_pct||0), p.subtotal_p,
            p.aplica_iva!==false, parseFloat(p.tasa_iva||16), p.iva_p, p.total_p]);
      }

      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
        VALUES ($1,'ingresos',$2,'INSERT',$3,$4)
      `, [req.usuario.id, ingId, JSON.stringify({folio,total,moneda}), req.ip]);

      return { id: ingId, folio, total };
    });

    logger.info('Ingreso creado', { folio: resultado.folio });
    return res.status(201).json({ ok:true, message:`Ingreso ${resultado.folio} registrado`, datos: resultado });
  } catch (err) {
    logger.error('Error creando ingreso:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ingresos/:id/cobros  — registrar cobro
// ════════════════════════════════════════════════════════════
const registrarCobro = async (req, res) => {
  const { id } = req.params;
  const { fecha, monto, moneda, tipo_cambio, forma_pago,
          cuenta_bancaria_id, cartera_cripto_id, hash_cripto, referencia, notas } = req.body;
  try {
    const tc = parseFloat(tipo_cambio || 1);
    const montoMxn = parseFloat((parseFloat(monto) * tc).toFixed(2));

    const cobroRes = await query(`
      INSERT INTO cobros
        (ingreso_id, fecha, monto, moneda, tipo_cambio, monto_mxn, forma_pago,
         cuenta_bancaria_id, cartera_cripto_id, hash_cripto, referencia, notas, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [id, fecha, parseFloat(monto), moneda||'MXN', tc, montoMxn,
        forma_pago||null, cuenta_bancaria_id||null, cartera_cripto_id||null,
        hash_cripto||null, referencia||null, notas||null, req.usuario.id]);

    logger.info('Cobro registrado', { ingreso_id: id, monto, moneda });
    return res.status(201).json({ ok:true, message:'Cobro registrado', datos: cobroRes.rows[0] });
  } catch (err) {
    logger.error('Error registrando cobro:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PUT /api/ingresos/:id
// ════════════════════════════════════════════════════════════
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { concepto, tipo, fecha, cliente_id, proyecto_id, notas } = req.body;
  try {
    await query(`
      UPDATE ingresos SET concepto=COALESCE($1,concepto), tipo=COALESCE($2,tipo),
        fecha=COALESCE($3,fecha), cliente_id=COALESCE($4,cliente_id),
        proyecto_id=COALESCE($5,proyecto_id), notas=$6, actualizado_en=NOW()
      WHERE id=$7
    `, [concepto, tipo, fecha, cliente_id, proyecto_id, notas, id]);
    return res.json({ ok:true, message:'Ingreso actualizado' });
  } catch (err) {
    logger.error('Error actualizando ingreso:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, registrarCobro, actualizar };
