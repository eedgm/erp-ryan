const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ── Genera folio de OT ────────────────────────────────────────
const generarFolioOT = async (client, unidadCodigo) => {
  const anio = new Date().getFullYear();
  const res = await client.query(`
    SELECT COUNT(*) AS total FROM ordenes_trabajo ot
    JOIN unidades_negocio u ON ot.unidad_negocio_id = u.id
    WHERE u.codigo = $1 AND EXTRACT(YEAR FROM ot.creado_en) = $2
  `, [unidadCodigo, anio]);
  const num = String(parseInt(res.rows[0].total) + 1).padStart(3, '0');
  return `OT-${unidadCodigo}-${anio}-${num}`;
};

// ── Query base para OTs ───────────────────────────────────────
const queryOTBase = `
  SELECT ot.*,
    p.folio  AS proyecto_folio,  p.nombre AS proyecto_nombre,
    un.codigo AS unidad_codigo,
    ao.clave  AS almacen_origen_clave,  ao.nombre AS almacen_origen_nombre,
    ad.clave  AS almacen_destino_clave, ad.nombre AS almacen_destino_nombre,
    fp.nombre AS familia_nombre,
    us.nombre || ' ' || COALESCE(us.apellidos,'') AS solicitante_nombre,
    ua.nombre || ' ' || COALESCE(ua.apellidos,'') AS autorizado_por_nombre,
    ue.nombre || ' ' || COALESCE(ue.apellidos,'') AS ejecutado_por_nombre,
    (SELECT COUNT(*) FROM ot_partidas op WHERE op.orden_trabajo_id = ot.id) AS total_partidas,
    (SELECT COUNT(*) FROM ot_partidas op WHERE op.orden_trabajo_id = ot.id AND op.estado_partida='ejecutada') AS partidas_ejecutadas
  FROM ordenes_trabajo ot
  LEFT JOIN proyectos p               ON ot.proyecto_id            = p.id
  LEFT JOIN unidades_negocio un       ON ot.unidad_negocio_id      = un.id
  LEFT JOIN almacenes ao              ON ot.almacen_origen_id      = ao.id
  LEFT JOIN almacenes ad              ON ot.almacen_destino_id     = ad.id
  LEFT JOIN familias_presupuesto_catalogo fp ON ot.familia_presupuesto_id = fp.id
  LEFT JOIN usuarios us               ON ot.solicitante_id         = us.id
  LEFT JOIN usuarios ua               ON ot.autorizado_por         = ua.id
  LEFT JOIN usuarios ue               ON ot.ejecutado_por          = ue.id
`;

// ════════════════════════════════════════════════════════════
// GET /api/ordenes-trabajo
// ════════════════════════════════════════════════════════════
const listar = async (req, res) => {
  try {
    const { estado, tipo, proyecto_id, unidad_id, search, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (estado)     { where += ` AND ot.estado = $${idx++}`;               params.push(estado); }
    if (tipo)       { where += ` AND ot.tipo = $${idx++}`;                 params.push(tipo); }
    if (proyecto_id){ where += ` AND ot.proyecto_id = $${idx++}`;          params.push(proyecto_id); }
    if (unidad_id)  { where += ` AND ot.unidad_negocio_id = $${idx++}`;    params.push(unidad_id); }
    if (search)     {
      where += ` AND (ot.folio ILIKE $${idx} OR p.folio ILIKE $${idx} OR p.nombre ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { where += ` AND ot.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(
      `SELECT COUNT(*) FROM ordenes_trabajo ot LEFT JOIN proyectos p ON ot.proyecto_id=p.id ${where}`,
      params
    )).rows[0].count);

    const sql = `${queryOTBase} ${where} ORDER BY ot.creado_en DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await query(sql, params);

    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error listando OTs:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/ordenes-trabajo/:id
// ════════════════════════════════════════════════════════════
const obtener = async (req, res) => {
  try {
    const otRes = await query(`${queryOTBase} WHERE ot.id = $1`, [req.params.id]);
    if (!otRes.rows.length) return res.status(404).json({ error: 'OT no encontrada' });

    const partidasRes = await query(`
      SELECT otp.*, ps.nombre AS producto_nombre, ps.codigo AS producto_codigo
      FROM ot_partidas otp
      JOIN productos_servicios ps ON otp.producto_id = ps.id
      WHERE otp.orden_trabajo_id = $1 ORDER BY otp.numero_partida
    `, [req.params.id]);

    const logRes = await query(`
      SELECT l.*, u.nombre || ' ' || COALESCE(u.apellidos,'') AS usuario_nombre
      FROM ot_estados_log l LEFT JOIN usuarios u ON l.usuario_id = u.id
      WHERE l.ot_id = $1 ORDER BY l.creado_en DESC
    `, [req.params.id]);

    return res.json({
      ok: true,
      datos: { ...otRes.rows[0], partidas: partidasRes.rows, log: logRes.rows }
    });
  } catch (err) {
    logger.error('Error obteniendo OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-trabajo
// ════════════════════════════════════════════════════════════
const crear = async (req, res) => {
  const {
    tipo, proyecto_id, unidad_negocio_id, almacen_origen_id, almacen_destino_id,
    familia_presupuesto_id, fecha_necesidad, orden_compra_id, motivo, notas, partidas
  } = req.body;

  if (almacen_origen_id === almacen_destino_id) {
    return res.status(400).json({ error: 'El almacén origen y destino deben ser diferentes' });
  }

  try {
    const resultado = await withTransaction(async (client) => {
      const unidadRes = await client.query(
        'SELECT codigo FROM unidades_negocio WHERE id = $1', [unidad_negocio_id]
      );
      const unidadCodigo = unidadRes.rows[0]?.codigo || 'GEN';
      const folio = await generarFolioOT(client, unidadCodigo);

      // Insertar OT
      const otRes = await client.query(`
        INSERT INTO ordenes_trabajo
          (folio, tipo, proyecto_id, unidad_negocio_id, almacen_origen_id,
           almacen_destino_id, familia_presupuesto_id, solicitante_id,
           fecha_necesidad, orden_compra_id, motivo, notas,
           estado, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'borrador',$8)
        RETURNING id, folio
      `, [
        folio, tipo, proyecto_id || null, unidad_negocio_id,
        almacen_origen_id, almacen_destino_id || null,
        familia_presupuesto_id || null, req.usuario.id,
        fecha_necesidad || null, orden_compra_id || null,
        motivo || null, notas || null
      ]);

      const otId    = otRes.rows[0].id;
      const otFolio = otRes.rows[0].folio;

      // Insertar partidas con verificación de stock actual
      for (let i = 0; i < partidas.length; i++) {
        const p = partidas[i];

        // Obtener stock actual en el almacén origen
        const stockRes = await client.query(
          'SELECT stock_actual FROM inventario WHERE producto_id=$1 AND almacen_id=$2',
          [p.producto_id, almacen_origen_id]
        );
        const stockActual = parseFloat(stockRes.rows[0]?.stock_actual || 0);

        // Obtener nombre del producto si no viene en la partida
        let descripcion = p.descripcion;
        if (!descripcion) {
          const prodRes = await client.query('SELECT nombre, unidad_medida FROM productos_servicios WHERE id=$1', [p.producto_id]);
          descripcion    = prodRes.rows[0]?.nombre || 'Producto';
          p.unidad_medida = p.unidad_medida || prodRes.rows[0]?.unidad_medida;
        }

        await client.query(`
          INSERT INTO ot_partidas
            (orden_trabajo_id, numero_partida, producto_id, descripcion,
             unidad_medida, cantidad_solicitada, stock_disponible)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [otId, i + 1, p.producto_id, descripcion,
            p.unidad_medida || null, parseFloat(p.cantidad_solicitada),
            stockActual]);
      }

      // Log de creación
      await client.query(`
        INSERT INTO ot_estados_log (ot_id, estado_nuevo, comentario, usuario_id)
        VALUES ($1,'borrador','OT creada',$2)
      `, [otId, req.usuario.id]);

      // Bitácora
      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
        VALUES ($1,'ordenes_trabajo',$2,'INSERT',$3,$4)
      `, [req.usuario.id, otId, JSON.stringify({ folio: otFolio, tipo }), req.ip]);

      return { id: otId, folio: otFolio };
    });

    logger.info('OT creada', { folio: resultado.folio });
    return res.status(201).json({
      ok: true,
      message: `Orden de Trabajo ${resultado.folio} creada`,
      datos: resultado
    });
  } catch (err) {
    logger.error('Error creando OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/ordenes-trabajo/:id/solicitar
// Enviar a revisión/autorización
// ════════════════════════════════════════════════════════════
const solicitarAutorizacion = async (req, res) => {
  const { id } = req.params;
  try {
    const ot = await query('SELECT estado FROM ordenes_trabajo WHERE id=$1', [id]);
    if (!ot.rows.length) return res.status(404).json({ error: 'OT no encontrada' });
    if (ot.rows[0].estado !== 'borrador') {
      return res.status(400).json({ error: `Solo borradores pueden solicitar autorización (actual: ${ot.rows[0].estado})` });
    }

    await withTransaction(async (client) => {
      await client.query(`UPDATE ordenes_trabajo SET estado='pendiente_autorizacion', actualizado_en=NOW() WHERE id=$1`, [id]);
      await client.query(`INSERT INTO ot_estados_log (ot_id,estado_antes,estado_nuevo,comentario,usuario_id) VALUES ($1,'borrador','pendiente_autorizacion','Solicitada autorización',$2)`, [id, req.usuario.id]);
    });

    return res.json({ ok: true, message: 'OT enviada a autorización' });
  } catch (err) {
    logger.error('Error solicitando autorización OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/ordenes-trabajo/:id/autorizar
// ════════════════════════════════════════════════════════════
const autorizar = async (req, res) => {
  const { id } = req.params;
  const { comentario } = req.body;

  try {
    const ot = await query('SELECT estado FROM ordenes_trabajo WHERE id=$1', [id]);
    if (!ot.rows.length) return res.status(404).json({ error: 'OT no encontrada' });
    if (!['borrador','pendiente_autorizacion'].includes(ot.rows[0].estado)) {
      return res.status(400).json({ error: `No se puede autorizar en estado: ${ot.rows[0].estado}` });
    }

    // Verificar stock suficiente en todas las partidas antes de autorizar
    const partidas = await query(`
      SELECT otp.*, i.stock_actual, ps.nombre AS prod_nombre
      FROM ot_partidas otp
      JOIN productos_servicios ps ON otp.producto_id = ps.id
      LEFT JOIN inventario i ON i.producto_id = otp.producto_id AND i.almacen_id = (
        SELECT almacen_origen_id FROM ordenes_trabajo WHERE id = $1
      )
      WHERE otp.orden_trabajo_id = $1
    `, [id]);

    const sinStock = partidas.rows.filter(p =>
      parseFloat(p.stock_actual || 0) < parseFloat(p.cantidad_solicitada)
    );

    if (sinStock.length) {
      return res.status(400).json({
        error: 'Stock insuficiente para autorizar',
        productos: sinStock.map(p => ({
          producto: p.prod_nombre,
          disponible: parseFloat(p.stock_actual || 0),
          requerido:  parseFloat(p.cantidad_solicitada)
        }))
      });
    }

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE ordenes_trabajo SET estado='autorizada', autorizado_por=$1,
          fecha_autorizacion=NOW(), actualizado_en=NOW() WHERE id=$2
      `, [req.usuario.id, id]);

      await client.query(`
        INSERT INTO ot_estados_log (ot_id,estado_antes,estado_nuevo,comentario,usuario_id)
        VALUES ($1,$2,'autorizada',$3,$4)
      `, [id, ot.rows[0].estado, comentario || 'Autorizada', req.usuario.id]);

      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,ip_address)
        VALUES ($1,'ordenes_trabajo',$2,'AUTORIZAR',$3)
      `, [req.usuario.id, id, req.ip]);
    });

    logger.info('OT autorizada', { id, por: req.usuario.email });
    return res.json({ ok: true, message: 'OT autorizada' });
  } catch (err) {
    logger.error('Error autorizando OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-trabajo/:id/ejecutar
// Ejecuta la función SQL que mueve el inventario
// ════════════════════════════════════════════════════════════
const ejecutar = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'SELECT ejecutar_orden_trabajo($1, $2) AS resultado',
      [id, req.usuario.id]
    );

    const resultado = result.rows[0].resultado;

    if (!resultado.ok) {
      logger.warn('Error ejecutando OT', { id, resultado });
      return res.status(400).json({
        error: resultado.error || 'Error ejecutando la OT',
        errores: resultado.errores
      });
    }

    // Bitácora
    await query(`
      INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
      VALUES ($1,'ordenes_trabajo',$2,'EJECUTAR',$3,$4)
    `, [req.usuario.id, id, JSON.stringify(resultado), req.ip]);

    logger.info('OT ejecutada', { id, costo: resultado.costo_total_mxn });
    return res.json({
      ok: true,
      message: 'OT ejecutada correctamente. Inventario actualizado.',
      datos: resultado
    });
  } catch (err) {
    logger.error('Error ejecutando OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/ordenes-trabajo/:id/cancelar
// ════════════════════════════════════════════════════════════
const cancelar = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  try {
    const ot = await query('SELECT estado FROM ordenes_trabajo WHERE id=$1', [id]);
    if (!ot.rows.length) return res.status(404).json({ error: 'OT no encontrada' });
    if (['ejecutada','cancelada'].includes(ot.rows[0].estado)) {
      return res.status(400).json({ error: `No se puede cancelar en estado: ${ot.rows[0].estado}` });
    }

    await withTransaction(async (client) => {
      const estadoAntes = ot.rows[0].estado;
      await client.query(`UPDATE ordenes_trabajo SET estado='cancelada', actualizado_en=NOW() WHERE id=$1`, [id]);
      await client.query(`INSERT INTO ot_estados_log (ot_id,estado_antes,estado_nuevo,comentario,usuario_id) VALUES ($1,$2,'cancelada',$3,$4)`,
        [id, estadoAntes, motivo || 'Cancelada', req.usuario.id]);
    });

    return res.json({ ok: true, message: 'OT cancelada' });
  } catch (err) {
    logger.error('Error cancelando OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/ordenes-trabajo/dashboard
// ════════════════════════════════════════════════════════════
const dashboard = async (req, res) => {
  try {
    const unidadFiltro = req.unidadFiltro;
    const where = unidadFiltro ? `AND ot.unidad_negocio_id = ${unidadFiltro}` : '';

    const kpis = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado='borrador')                 AS borrador,
        COUNT(*) FILTER (WHERE estado='pendiente_autorizacion')   AS pendiente_auth,
        COUNT(*) FILTER (WHERE estado='autorizada')               AS autorizada,
        COUNT(*) FILTER (WHERE estado='ejecutada')                AS ejecutada,
        COUNT(*) FILTER (WHERE estado='cancelada')                AS cancelada,
        COALESCE(SUM(costo_total_mxn) FILTER (WHERE estado='ejecutada' AND fecha_ejecucion >= date_trunc('month', CURRENT_DATE)),0) AS costo_mes_mxn
      FROM ordenes_trabajo ot WHERE 1=1 ${where}
    `);

    // OTs pendientes de autorización más antiguas
    const pendientes = await query(`
      SELECT ot.id, ot.folio, ot.tipo, ot.motivo, ot.fecha_solicitud,
        p.folio AS proyecto_folio, un.codigo AS unidad_codigo,
        ao.clave AS almacen_origen,
        u.nombre AS solicitante,
        CURRENT_DATE - ot.fecha_solicitud AS dias_espera
      FROM ordenes_trabajo ot
      LEFT JOIN proyectos p ON ot.proyecto_id = p.id
      LEFT JOIN unidades_negocio un ON ot.unidad_negocio_id = un.id
      LEFT JOIN almacenes ao ON ot.almacen_origen_id = ao.id
      LEFT JOIN usuarios u ON ot.solicitante_id = u.id
      WHERE ot.estado = 'pendiente_autorizacion' ${where}
      ORDER BY ot.fecha_solicitud ASC LIMIT 10
    `);

    return res.json({
      ok: true,
      kpis: kpis.rows[0],
      pendientes_auth: pendientes.rows
    });
  } catch (err) {
    logger.error('Error en dashboard OT:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, solicitarAutorizacion, autorizar, ejecutar, cancelar, dashboard };
