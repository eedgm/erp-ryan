const { query, withTransaction } = require('../config/database');
const { enviarOrdenCompra } = require('../services/emailService');
const logger = require('../utils/logger');

// ── Genera folio de OC ────────────────────────────────────────
const generarFolioOC = async (client, unidadCodigo) => {
  const anio = new Date().getFullYear();
  const res = await client.query(`
    SELECT COUNT(*) AS total FROM ordenes_compra oc
    JOIN unidades_negocio u ON oc.unidad_negocio_id = u.id
    WHERE u.codigo = $1 AND EXTRACT(YEAR FROM oc.creado_en) = $2
  `, [unidadCodigo, anio]);
  const num = String(parseInt(res.rows[0].total) + 1).padStart(3, '0');
  return `OC-${unidadCodigo}-${anio}-${num}`;
};

// ── Verificar stock de una lista de productos ─────────────────
const verificarStock = async (items) => {
  // items = [{ producto_id, cantidad }]
  const resultado = [];
  for (const item of items) {
    // Buscar stock en todos los almacenes generales, priorizando MXN > USD > RST
    const stockRes = await query(`
      SELECT i.almacen_id, a.clave, a.nombre AS almacen_nombre, a.tipo,
             i.stock_actual, i.costo_promedio, i.costo_moneda, i.costo_promedio_mxn
      FROM inventario i
      JOIN almacenes a ON i.almacen_id = a.id
      WHERE i.producto_id = $1 AND i.stock_actual > 0
        AND a.tipo IN ('general_mxn','general_usd','general_rst')
        AND a.activo = true
      ORDER BY
        CASE a.tipo
          WHEN 'general_mxn' THEN 1
          WHEN 'general_usd' THEN 2
          WHEN 'general_rst' THEN 3
        END
    `, [item.producto_id]);

    const stockTotal = stockRes.rows.reduce((a, r) => a + parseFloat(r.stock_actual), 0);
    const cantidad   = parseFloat(item.cantidad);
    const mejorAlmacen = stockRes.rows[0] || null;

    let accion, cantAlmacen, cantComprar;

    if (stockTotal >= cantidad) {
      accion = 'de_almacen';
      cantAlmacen = cantidad;
      cantComprar = 0;
    } else if (stockTotal > 0) {
      accion = 'mixto';
      cantAlmacen = stockTotal;
      cantComprar = cantidad - stockTotal;
    } else {
      accion = 'comprar';
      cantAlmacen = 0;
      cantComprar = cantidad;
    }

    resultado.push({
      producto_id:         item.producto_id,
      cantidad_solicitada: cantidad,
      stock_total:         stockTotal,
      stock_detalle:       stockRes.rows,
      almacen_sugerido:    mejorAlmacen,
      accion,
      cantidad_de_almacen: cantAlmacen,
      cantidad_a_comprar:  cantComprar,
    });
  }
  return resultado;
};

// ════════════════════════════════════════════════════════════
// GET /api/ordenes-compra
// ════════════════════════════════════════════════════════════
const listar = async (req, res) => {
  try {
    const { estado, proyecto_id, proveedor_id, unidad_id,
            search, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT oc.*,
        p.folio  AS proyecto_folio, p.nombre AS proyecto_nombre,
        pv.nombre AS proveedor_nombre, pv.email AS proveedor_email,
        un.codigo AS unidad_codigo,
        u.nombre  AS solicitante_nombre,
        au.nombre AS autorizado_por_nombre,
        (SELECT COUNT(*) FROM oc_partidas op WHERE op.orden_compra_id = oc.id) AS total_partidas,
        (SELECT COUNT(*) FROM oc_partidas op WHERE op.orden_compra_id = oc.id AND op.estado_partida = 'completo') AS partidas_completas
      FROM ordenes_compra oc
      LEFT JOIN proyectos p ON oc.proyecto_id = p.id
      LEFT JOIN proveedores pv ON oc.proveedor_id = pv.id
      LEFT JOIN unidades_negocio un ON oc.unidad_negocio_id = un.id
      LEFT JOIN usuarios u  ON oc.solicitante_id = u.id
      LEFT JOIN usuarios au ON oc.autorizado_por = au.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (estado)      { sql += ` AND oc.estado = $${idx++}`;               params.push(estado); }
    if (proyecto_id) { sql += ` AND oc.proyecto_id = $${idx++}`;          params.push(proyecto_id); }
    if (proveedor_id){ sql += ` AND oc.proveedor_id = $${idx++}`;         params.push(proveedor_id); }
    if (unidad_id)   { sql += ` AND oc.unidad_negocio_id = $${idx++}`;    params.push(unidad_id); }
    if (search)      {
      sql += ` AND (oc.folio ILIKE $${idx} OR p.folio ILIKE $${idx} OR p.nombre ILIKE $${idx} OR pv.nombre ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND oc.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);
    sql += ` ORDER BY oc.creado_en DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error listando OC:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/ordenes-compra/:id
// ════════════════════════════════════════════════════════════
const obtener = async (req, res) => {
  try {
    const ocRes = await query(`
      SELECT oc.*,
        p.folio AS proyecto_folio, p.nombre AS proyecto_nombre,
        pv.nombre AS proveedor_nombre, pv.email AS proveedor_email,
        pv.rfc AS proveedor_rfc, pv.email_compras,
        un.codigo AS unidad_codigo,
        u.nombre || ' ' || COALESCE(u.apellidos,'') AS solicitante_nombre,
        e.nombre AS empresa_nombre, e.rfc AS empresa_rfc
      FROM ordenes_compra oc
      LEFT JOIN proyectos p ON oc.proyecto_id = p.id
      LEFT JOIN proveedores pv ON oc.proveedor_id = pv.id
      LEFT JOIN unidades_negocio un ON oc.unidad_negocio_id = un.id
      LEFT JOIN usuarios u ON oc.solicitante_id = u.id
      LEFT JOIN empresa e ON true
      WHERE oc.id = $1
    `, [req.params.id]);

    if (!ocRes.rows.length) return res.status(404).json({ error: 'OC no encontrada' });

    const partRes = await query(`
      SELECT op.*,
        ps.nombre AS producto_nombre, ps.codigo AS producto_codigo,
        a.clave AS almacen_stock_clave, a.nombre AS almacen_stock_nombre
      FROM oc_partidas op
      LEFT JOIN productos_servicios ps ON op.producto_id = ps.id
      LEFT JOIN almacenes a ON op.almacen_con_stock_id = a.id
      WHERE op.orden_compra_id = $1
      ORDER BY op.numero_partida
    `, [req.params.id]);

    const recRes = await query(`
      SELECT r.*, op.descripcion AS partida_descripcion,
        a.clave AS almacen_clave,
        u.nombre || ' ' || COALESCE(u.apellidos,'') AS recibido_por_nombre
      FROM oc_recepciones r
      JOIN oc_partidas op ON r.oc_partida_id = op.id
      LEFT JOIN almacenes a ON r.almacen_destino_id = a.id
      LEFT JOIN usuarios u ON r.recibido_por = u.id
      WHERE r.orden_compra_id = $1
      ORDER BY r.fecha_recepcion DESC
    `, [req.params.id]);

    return res.json({
      ok: true,
      datos: { ...ocRes.rows[0], partidas: partRes.rows, recepciones: recRes.rows }
    });
  } catch (err) {
    logger.error('Error obteniendo OC:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-compra/verificar-stock
// Pre-verificación antes de crear la OC
// ════════════════════════════════════════════════════════════
const verificarStockEndpoint = async (req, res) => {
  try {
    const { items } = req.body; // [{ producto_id, cantidad }]
    if (!items?.length) return res.status(400).json({ error: 'items requeridos' });
    const resultado = await verificarStock(items);
    return res.json({ ok: true, datos: resultado });
  } catch (err) {
    logger.error('Error verificando stock:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-compra
// ════════════════════════════════════════════════════════════
const crear = async (req, res) => {
  const { proyecto_id, unidad_negocio_id, proveedor_id, fecha_necesidad,
          moneda, tipo_cambio, partidas, condiciones_pago,
          lugar_entrega, notas } = req.body;

  try {
    const resultado = await withTransaction(async (client) => {
      const unidadRes = await client.query(
        'SELECT codigo FROM unidades_negocio WHERE id = $1', [unidad_negocio_id]
      );
      const unidadCodigo = unidadRes.rows[0]?.codigo || 'GEN';
      const folio = await generarFolioOC(client, unidadCodigo);
      const tc = parseFloat(tipo_cambio || 1);

      // Verificar stock de los ítems
      const stockVerificado = await verificarStock(
        partidas.map(p => ({ producto_id: p.producto_id, cantidad: p.cantidad_solicitada }))
      );

      // Calcular totales de la OC
      let subtotal = 0, ivaTotal = 0;
      const partidasConCalculo = partidas.map((p, i) => {
        const sv = stockVerificado[i];
        const qty   = parseFloat(p.cantidad_solicitada);
        const price = parseFloat(p.precio_unitario || 0);
        const desc  = parseFloat(p.descuento_pct || 0);
        const sub   = qty * price * (1 - desc / 100);
        const tiva  = parseFloat(p.tasa_iva ?? 16);
        const iva   = p.aplica_iva !== false ? sub * (tiva / 100) : 0;
        subtotal += sub;
        ivaTotal += iva;
        return { ...p, sv, subtotal_partida: sub, iva_partida: iva, total_partida: sub + iva };
      });

      const total    = subtotal + ivaTotal;
      const totalMxn = total * tc;

      // Insertar OC
      const ocRes = await client.query(`
        INSERT INTO ordenes_compra
          (folio, proyecto_id, unidad_negocio_id, proveedor_id, solicitante_id,
           fecha_necesidad, moneda, tipo_cambio, subtotal, iva, total, total_mxn,
           condiciones_pago, lugar_entrega, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id, folio
      `, [folio, proyecto_id || null, unidad_negocio_id, proveedor_id || null,
          req.usuario.id, fecha_necesidad || null, moneda || 'MXN', tc,
          subtotal, ivaTotal, total, totalMxn,
          condiciones_pago || null, lugar_entrega || null, notas || null,
          req.usuario.id]);

      const ocId    = ocRes.rows[0].id;
      const ocFolio = ocRes.rows[0].folio;

      // Insertar partidas
      for (let i = 0; i < partidasConCalculo.length; i++) {
        const p  = partidasConCalculo[i];
        const sv = p.sv;
        await client.query(`
          INSERT INTO oc_partidas
            (orden_compra_id, numero_partida, producto_id, descripcion, unidad_medida,
             cantidad_solicitada, precio_unitario, descuento_pct, subtotal, aplica_iva,
             tasa_iva, iva, total, stock_verificado, almacen_con_stock_id,
             accion_sugerida, cantidad_de_almacen, cantidad_a_comprar)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        `, [
          ocId, i + 1, p.producto_id || null,
          p.descripcion, p.unidad_medida || null,
          parseFloat(p.cantidad_solicitada),
          parseFloat(p.precio_unitario || 0),
          parseFloat(p.descuento_pct || 0),
          p.subtotal_partida, p.aplica_iva !== false,
          parseFloat(p.tasa_iva ?? 16), p.iva_partida, p.total_partida,
          sv.stock_total, sv.almacen_sugerido?.almacen_id || null,
          sv.accion, sv.cantidad_de_almacen, sv.cantidad_a_comprar,
        ]);

        // Si hay productos que salen de almacén, crear requisición interna
        if (sv.accion === 'comprar' || sv.accion === 'mixto') {
          const numReq = String((await client.query('SELECT COUNT(*)+1 AS n FROM requisiciones')).rows[0].n).padStart(4,'0');
          await client.query(`
            INSERT INTO requisiciones
              (folio, orden_compra_id, proyecto_id, unidad_negocio_id,
               producto_id, descripcion, cantidad, unidad_medida,
               fecha_requerida, moneda, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `, [
            `REQ-${unidadCodigo}-${new Date().getFullYear()}-${numReq}`,
            ocId, proyecto_id || null, unidad_negocio_id,
            p.producto_id || null, p.descripcion,
            sv.cantidad_a_comprar, p.unidad_medida || null,
            fecha_necesidad || null, moneda || 'MXN', req.usuario.id
          ]);
        }
      }

      // Bitácora
      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
        VALUES ($1,'ordenes_compra',$2,'INSERT',$3,$4)
      `, [req.usuario.id, ocId, JSON.stringify({ folio: ocFolio, total }), req.ip]);

      return { id: ocId, folio: ocFolio, total, partidas: partidasConCalculo.length };
    });

    logger.info('OC creada', { folio: resultado.folio, por: req.usuario.email });
    return res.status(201).json({
      ok: true,
      message: `Orden de compra ${resultado.folio} creada`,
      datos: resultado
    });
  } catch (err) {
    logger.error('Error creando OC:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/ordenes-compra/:id/autorizar
// ════════════════════════════════════════════════════════════
const autorizar = async (req, res) => {
  const { id } = req.params;
  try {
    const oc = await query('SELECT estado FROM ordenes_compra WHERE id=$1', [id]);
    if (!oc.rows.length) return res.status(404).json({ error: 'OC no encontrada' });
    if (!['borrador','en_revision'].includes(oc.rows[0].estado)) {
      return res.status(400).json({ error: `No se puede autorizar en estado: ${oc.rows[0].estado}` });
    }
    await query(`
      UPDATE ordenes_compra SET estado='autorizada', autorizado_por=$1, fecha_autorizacion=NOW(), actualizado_en=NOW()
      WHERE id=$2
    `, [req.usuario.id, id]);
    return res.json({ ok: true, message: 'OC autorizada' });
  } catch (err) {
    logger.error('Error autorizando OC:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-compra/:id/enviar-email
// ════════════════════════════════════════════════════════════
const enviarEmail = async (req, res) => {
  const { id } = req.params;
  const { email_destino } = req.body;

  try {
    const ocRes = await query(`
      SELECT oc.*, pv.nombre AS proveedor_nombre, pv.email AS proveedor_email,
        pv.rfc AS proveedor_rfc, p.folio AS proyecto_folio, p.nombre AS proyecto_nombre,
        e.nombre AS empresa_nombre, e.rfc AS empresa_rfc
      FROM ordenes_compra oc
      LEFT JOIN proveedores pv ON oc.proveedor_id = pv.id
      LEFT JOIN proyectos p ON oc.proyecto_id = p.id
      LEFT JOIN empresa e ON true
      WHERE oc.id = $1
    `, [id]);

    if (!ocRes.rows.length) return res.status(404).json({ error: 'OC no encontrada' });

    const oc = ocRes.rows[0];
    if (!['autorizada','enviada_proveedor'].includes(oc.estado)) {
      return res.status(400).json({ error: 'La OC debe estar autorizada para enviar' });
    }

    // Obtener partidas
    const partidasRes = await query(
      'SELECT * FROM oc_partidas WHERE orden_compra_id=$1 ORDER BY numero_partida', [id]
    );

    const emailA = email_destino || oc.email_compras || oc.proveedor_email;
    if (!emailA) return res.status(400).json({ error: 'No hay email de destino configurado para el proveedor' });

    await enviarOrdenCompra({ ...oc, partidas: partidasRes.rows, email_enviado_a: emailA });

    // Actualizar estado y registro de envío
    await query(`
      UPDATE ordenes_compra SET estado='enviada_proveedor',
        email_enviado_a=$1, fecha_envio_email=NOW(), actualizado_en=NOW()
      WHERE id=$2
    `, [emailA, id]);

    logger.info('OC enviada por email', { folio: oc.folio, a: emailA });
    return res.json({ ok: true, message: `OC enviada a: ${emailA}` });

  } catch (err) {
    logger.error('Error enviando OC por email:', err);
    return res.status(500).json({ error: 'Error enviando email: ' + err.message });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/ordenes-compra/:id/recepcion
// Registrar recepción total o parcial
// ════════════════════════════════════════════════════════════
const registrarRecepcion = async (req, res) => {
  const { id } = req.params;
  const { recepciones, fecha_recepcion, numero_remision, numero_factura, notas } = req.body;
  // recepciones = [{ oc_partida_id, cantidad_recibida, almacen_destino_id, costo_unitario_real }]

  try {
    await withTransaction(async (client) => {
      const fechaRec = fecha_recepcion || new Date().toISOString().split('T')[0];

      for (const rec of recepciones) {
        if (parseFloat(rec.cantidad_recibida) <= 0) continue;

        // Obtener datos de la partida
        const partida = await client.query(
          'SELECT * FROM oc_partidas WHERE id=$1 AND orden_compra_id=$2',
          [rec.oc_partida_id, id]
        );
        if (!partida.rows.length) continue;

        const p = partida.rows[0];
        const cantRecibida = parseFloat(rec.cantidad_recibida);

        // Insertar recepción
        await client.query(`
          INSERT INTO oc_recepciones
            (orden_compra_id, oc_partida_id, fecha_recepcion, cantidad_recibida,
             costo_unitario_real, almacen_destino_id, numero_remision, numero_factura,
             notas, recibido_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [id, rec.oc_partida_id, fechaRec, cantRecibida,
            rec.costo_unitario_real || p.precio_unitario,
            rec.almacen_destino_id || null,
            numero_remision || null, numero_factura || null,
            notas || null, req.usuario.id]);

        // Actualizar cantidad recibida en la partida
        const totalRecibido = parseFloat(p.cantidad_recibida) + cantRecibida;
        const estadoPartida = totalRecibido >= parseFloat(p.cantidad_solicitada) ? 'completo' : 'parcial';
        await client.query(`
          UPDATE oc_partidas SET cantidad_recibida=$1, estado_partida=$2 WHERE id=$3
        `, [totalRecibido, estadoPartida, rec.oc_partida_id]);

        // Si tiene almacén destino, registrar entrada de inventario
        if (rec.almacen_destino_id && p.producto_id) {
          await client.query(`
            INSERT INTO movimientos_inventario
              (producto_id, almacen_destino_id, tipo, cantidad, costo_unitario,
               costo_moneda, costo_unitario_mxn, costo_total_mxn, orden_compra_id, fecha, creado_por)
            VALUES ($1,$2,'entrada',$3,$4,'MXN',$4,$5,$6,$7,$8)
          `, [p.producto_id, rec.almacen_destino_id, cantRecibida,
              rec.costo_unitario_real || p.precio_unitario,
              (rec.costo_unitario_real || p.precio_unitario) * cantRecibida,
              id, fechaRec, req.usuario.id]);

          await client.query('SELECT recalcular_stock($1,$2)', [p.producto_id, rec.almacen_destino_id]);
        }
      }

      // Actualizar estado general de la OC
      const partidasRes = await client.query(
        'SELECT estado_partida FROM oc_partidas WHERE orden_compra_id=$1', [id]
      );
      const todas = partidasRes.rows;
      const todasCompletas = todas.every(p => p.estado_partida === 'completo');
      const algunaParcial  = todas.some(p => ['parcial','completo'].includes(p.estado_partida));
      const nuevoEstadoOC  = todasCompletas ? 'recibida_total' : algunaParcial ? 'recibida_parcial' : null;
      if (nuevoEstadoOC) {
        await client.query('UPDATE ordenes_compra SET estado=$1, actualizado_en=NOW() WHERE id=$2',
          [nuevoEstadoOC, id]);
      }

      await client.query(`
        INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
        VALUES ($1,'ordenes_compra',$2,'RECEPCION',$3,$4)
      `, [req.usuario.id, id, JSON.stringify({ recepciones: recepciones.length }), req.ip]);
    });

    return res.json({ ok: true, message: 'Recepción registrada correctamente' });
  } catch (err) {
    logger.error('Error registrando recepción:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/requisiciones — Panel de compras
// ════════════════════════════════════════════════════════════
const listarRequisiciones = async (req, res) => {
  try {
    const { estado, search, page = 1, limit = 50 } = req.query;
    const offset = (page-1)*limit;

    let sql = `
      SELECT r.*,
        ps.nombre AS producto_nombre, ps.codigo AS producto_codigo,
        p.folio AS proyecto_folio, p.nombre AS proyecto_nombre,
        un.codigo AS unidad_codigo,
        pv.nombre AS proveedor_nombre, pv.email_compras,
        oc.folio AS oc_folio,
        -- Stock actual en almacenes generales
        COALESCE((
          SELECT SUM(i.stock_actual)
          FROM inventario i JOIN almacenes a ON i.almacen_id=a.id
          WHERE i.producto_id=r.producto_id AND a.tipo IN ('general_mxn','general_usd','general_rst')
        ), 0) AS stock_disponible,
        -- Semáforo de stock
        CASE
          WHEN r.cantidad <= COALESCE((
            SELECT SUM(i.stock_actual) FROM inventario i JOIN almacenes a ON i.almacen_id=a.id
            WHERE i.producto_id=r.producto_id AND a.tipo IN ('general_mxn','general_usd','general_rst')
          ), 0) THEN 'verde'
          WHEN 0 < COALESCE((
            SELECT SUM(i.stock_actual) FROM inventario i JOIN almacenes a ON i.almacen_id=a.id
            WHERE i.producto_id=r.producto_id AND a.tipo IN ('general_mxn','general_usd','general_rst')
          ), 0) THEN 'amarillo'
          ELSE 'rojo'
        END AS semaforo_stock
      FROM requisiciones r
      LEFT JOIN productos_servicios ps ON r.producto_id=ps.id
      LEFT JOIN proyectos p ON r.proyecto_id=p.id
      LEFT JOIN unidades_negocio un ON r.unidad_negocio_id=un.id
      LEFT JOIN proveedores pv ON r.proveedor_id=pv.id
      LEFT JOIN ordenes_compra oc ON r.orden_compra_id=oc.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (estado) { sql += ` AND r.estado = $${idx++}`; params.push(estado); }
    if (search) {
      sql += ` AND (r.descripcion ILIKE $${idx} OR ps.nombre ILIKE $${idx} OR p.folio ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND r.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);
    sql += ` ORDER BY r.fecha_requerida ASC NULLS LAST, r.creado_en ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, datos: result.rows });
  } catch (err) {
    logger.error('Error listando requisiciones:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

// PATCH /api/requisiciones/:id/proveedor — asignar proveedor a una requisición
const asignarProveedor = async (req, res) => {
  const { id } = req.params;
  const { proveedor_id, monto_estimado, fecha_pago_programada } = req.body;
  try {
    await query(`
      UPDATE requisiciones SET proveedor_id=$1, monto_estimado=$2,
        fecha_pago_programada=$3, estado='en_proceso', actualizado_en=NOW()
      WHERE id=$4
    `, [proveedor_id, monto_estimado || 0, fecha_pago_programada || null, id]);
    return res.json({ ok: true, message: 'Proveedor asignado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno' });
  }
};

// PATCH /api/ordenes-compra/:id/cancelar
const cancelar = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  try {
    const oc = await query('SELECT estado FROM ordenes_compra WHERE id=$1', [id]);
    if (!oc.rows.length) return res.status(404).json({ error: 'OC no encontrada' });
    if (['recibida_total','cancelada'].includes(oc.rows[0].estado)) {
      return res.status(400).json({ error: 'No se puede cancelar en este estado' });
    }
    await withTransaction(async (client) => {
      await client.query('UPDATE ordenes_compra SET estado=\'cancelada\', actualizado_en=NOW() WHERE id=$1', [id]);
      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address) VALUES ($1,'ordenes_compra',$2,'CANCELAR',$3,$4)`,
        [req.usuario.id, id, JSON.stringify({ motivo }), req.ip]);
    });
    return res.json({ ok: true, message: 'OC cancelada' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno' });
  }
};

module.exports = {
  listar, obtener, crear, autorizar, enviarEmail,
  registrarRecepcion, cancelar,
  verificarStockEndpoint, listarRequisiciones, asignarProveedor
};
