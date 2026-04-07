const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ════════════════════════════════════════════════════════════
// ALMACENES — CRUD
// ════════════════════════════════════════════════════════════

// GET /api/almacenes
const listar = async (req, res) => {
  try {
    const { tipo, activo, unidad_id, proyecto_id } = req.query;
    let sql = `
      SELECT a.*,
        un.codigo AS unidad_codigo, un.nombre AS unidad_nombre,
        p.folio AS proyecto_folio, p.nombre AS proyecto_nombre,
        (SELECT COUNT(*) FROM inventario i WHERE i.almacen_id = a.id AND i.stock_actual > 0) AS productos_con_stock,
        (SELECT COALESCE(SUM(i.valor_total_mxn),0) FROM v_inventario i WHERE i.almacen_clave = a.clave) AS valor_total_mxn
      FROM almacenes a
      LEFT JOIN unidades_negocio un ON a.unidad_negocio_id = un.id
      LEFT JOIN proyectos p ON a.proyecto_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (activo !== undefined) { sql += ` AND a.activo = $${idx++}`; params.push(activo === 'true'); }
    if (tipo)        { sql += ` AND a.tipo = $${idx++}`;                params.push(tipo); }
    if (unidad_id)   { sql += ` AND a.unidad_negocio_id = $${idx++}`;  params.push(unidad_id); }
    if (proyecto_id) { sql += ` AND a.proyecto_id = $${idx++}`;         params.push(proyecto_id); }
    if (req.unidadFiltro) { sql += ` AND a.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }
    sql += ' ORDER BY a.tipo, a.clave';
    const result = await query(sql, params);
    return res.json({ ok: true, total: result.rowCount, datos: result.rows });
  } catch (err) {
    logger.error('Error listando almacenes:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/almacenes/:id
const obtener = async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*,
        un.codigo AS unidad_codigo,
        p.folio AS proyecto_folio, p.nombre AS proyecto_nombre
      FROM almacenes a
      LEFT JOIN unidades_negocio un ON a.unidad_negocio_id = un.id
      LEFT JOIN proyectos p ON a.proyecto_id = p.id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Almacen no encontrado' });
    return res.json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error obteniendo almacen:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/almacenes  (solo para almacenes de folio manuales)
const crear = async (req, res) => {
  try {
    const { clave, nombre, tipo, moneda_valuacion, ubicacion,
            unidad_negocio_id, proyecto_id, notas } = req.body;
    const result = await withTransaction(async (client) => {
      const ins = await client.query(`
        INSERT INTO almacenes (clave, nombre, tipo, moneda_valuacion, ubicacion, unidad_negocio_id, proyecto_id, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, clave, nombre
      `, [clave, nombre, tipo||'folio', moneda_valuacion||'MXN', ubicacion||null,
          unidad_negocio_id||null, proyecto_id||null, notas||null, req.usuario.id]);
      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address) VALUES ($1,'almacenes',$2,'INSERT',$3,$4)`,
        [req.usuario.id, ins.rows[0].id, JSON.stringify({clave, nombre}), req.ip]);
      return ins.rows[0];
    });
    return res.status(201).json({ ok: true, datos: result });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'La clave de almacen ya existe' });
    logger.error('Error creando almacen:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PUT /api/almacenes/:id
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, ubicacion, unidad_negocio_id, activo, notas } = req.body;
    await query(`
      UPDATE almacenes SET nombre=COALESCE($1,nombre), ubicacion=$2,
        unidad_negocio_id=COALESCE($3,unidad_negocio_id),
        activo=COALESCE($4,activo), notas=$5 WHERE id=$6
    `, [nombre, ubicacion, unidad_negocio_id, activo, notas, id]);
    return res.json({ ok: true, message: 'Almacen actualizado' });
  } catch (err) {
    logger.error('Error actualizando almacen:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// INVENTARIO — CONSULTAS
// ════════════════════════════════════════════════════════════

// GET /api/almacenes/:id/inventario
const inventarioAlmacen = async (req, res) => {
  try {
    const { id } = req.params;
    const { search, alerta, tipo, page=1, limit=50 } = req.query;
    const offset = (page-1)*limit;

    let sql = `SELECT * FROM v_inventario WHERE almacen_clave = (SELECT clave FROM almacenes WHERE id = $1)`;
    const params = [id];
    let idx = 2;

    if (search) {
      sql += ` AND (producto_nombre ILIKE $${idx} OR producto_codigo ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (alerta) { sql += ` AND alerta_stock = $${idx++}`; params.push(alerta); }
    if (tipo)   { sql += ` AND producto_tipo = $${idx++}`; params.push(tipo); }

    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countRes.rows[0].count);

    sql += ` ORDER BY alerta_stock DESC, producto_nombre LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error obteniendo inventario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/inventario/stock?producto_id=X  — stock de un producto en todos los almacenes
const stockProducto = async (req, res) => {
  try {
    const { producto_id } = req.query;
    if (!producto_id) return res.status(400).json({ error: 'producto_id requerido' });
    const result = await query(`
      SELECT v.*, a.id AS almacen_id
      FROM v_inventario v
      JOIN almacenes a ON a.clave = v.almacen_clave
      WHERE a.producto_id IS NULL  -- evitar subquery innecesaria
        -- Reformulo:
      ORDER BY v.almacen_tipo, v.almacen_clave
    `);
    // Forma directa:
    const r2 = await query(`
      SELECT i.*, a.clave, a.nombre AS almacen_nombre, a.tipo AS almacen_tipo,
        ps.nombre AS producto_nombre, ps.unidad_medida
      FROM inventario i
      JOIN almacenes a ON i.almacen_id = a.id
      JOIN productos_servicios ps ON i.producto_id = ps.id
      WHERE i.producto_id = $1 AND a.activo = true AND i.stock_actual > 0
      ORDER BY a.tipo, a.clave
    `, [producto_id]);
    return res.json({
      ok: true,
      producto_id: parseInt(producto_id),
      stock_total: r2.rows.reduce((a, r) => a + parseFloat(r.stock_actual), 0),
      por_almacen: r2.rows
    });
  } catch (err) {
    logger.error('Error en stock producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// MOVIMIENTOS — ENTRADA / SALIDA / AJUSTE
// ════════════════════════════════════════════════════════════

// POST /api/almacenes/movimiento
const registrarMovimiento = async (req, res) => {
  const { tipo, producto_id, almacen_origen_id, almacen_destino_id,
          cantidad, costo_unitario, costo_moneda, tipo_cambio,
          proyecto_id, referencia, notas, fecha } = req.body;

  try {
    const resultado = await withTransaction(async (client) => {
      const tc = parseFloat(tipo_cambio || 1);
      const cu = parseFloat(costo_unitario || 0);
      const cuMxn = costo_moneda === 'MXN' ? cu : cu * tc;

      // Validar stock suficiente para salidas
      if (['salida','traspaso_salida','ajuste_negativo'].includes(tipo)) {
        const stockRes = await client.query(
          'SELECT stock_actual FROM inventario WHERE producto_id=$1 AND almacen_id=$2',
          [producto_id, almacen_origen_id]
        );
        const stockActual = parseFloat(stockRes.rows[0]?.stock_actual || 0);
        if (stockActual < parseFloat(cantidad)) {
          throw new Error(`Stock insuficiente. Disponible: ${stockActual}, Requerido: ${cantidad}`);
        }
      }

      // Insertar movimiento
      const mov = await client.query(`
        INSERT INTO movimientos_inventario
          (producto_id, almacen_origen_id, almacen_destino_id, tipo, cantidad,
           costo_unitario, costo_moneda, tipo_cambio, costo_unitario_mxn,
           costo_total_mxn, proyecto_id, referencia, notas, fecha, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id
      `, [
        producto_id, almacen_origen_id||null, almacen_destino_id||null,
        tipo, parseFloat(cantidad), cu||null, costo_moneda||'MXN',
        tc, cuMxn||null, (cuMxn * parseFloat(cantidad))||null,
        proyecto_id||null, referencia||null, notas||null,
        fecha || new Date().toISOString().split('T')[0],
        req.usuario.id
      ]);

      // Recalcular stock en almacenes afectados
      if (almacen_origen_id) {
        await client.query('SELECT recalcular_stock($1,$2)', [producto_id, almacen_origen_id]);
      }
      if (almacen_destino_id && almacen_destino_id !== almacen_origen_id) {
        await client.query('SELECT recalcular_stock($1,$2)', [producto_id, almacen_destino_id]);
      }

      return mov.rows[0];
    });

    logger.info('Movimiento registrado', { tipo, producto_id, cantidad });
    return res.status(201).json({ ok: true, datos: resultado });

  } catch (err) {
    if (err.message.includes('Stock insuficiente')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('Error registrando movimiento:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/almacenes/:id/movimientos
const movimientosAlmacen = async (req, res) => {
  try {
    const { id } = req.params;
    const { page=1, limit=30, producto_id, tipo, desde, hasta } = req.query;
    const offset = (page-1)*limit;

    let sql = `
      SELECT m.*,
        ps.nombre AS producto_nombre, ps.codigo AS producto_codigo, ps.unidad_medida,
        ao.clave AS almacen_origen_clave, ad.clave AS almacen_destino_clave,
        u.nombre || ' ' || COALESCE(u.apellidos,'') AS creado_por_nombre,
        p.folio AS proyecto_folio
      FROM movimientos_inventario m
      JOIN productos_servicios ps ON m.producto_id = ps.id
      LEFT JOIN almacenes ao ON m.almacen_origen_id = ao.id
      LEFT JOIN almacenes ad ON m.almacen_destino_id = ad.id
      LEFT JOIN usuarios u ON m.creado_por = u.id
      LEFT JOIN proyectos p ON m.proyecto_id = p.id
      WHERE (m.almacen_origen_id = $1 OR m.almacen_destino_id = $1)
    `;
    const params = [id];
    let idx = 2;

    if (producto_id) { sql += ` AND m.producto_id = $${idx++}`; params.push(producto_id); }
    if (tipo)        { sql += ` AND m.tipo = $${idx++}`; params.push(tipo); }
    if (desde)       { sql += ` AND m.fecha >= $${idx++}`; params.push(desde); }
    if (hasta)       { sql += ` AND m.fecha <= $${idx++}`; params.push(hasta); }

    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countRes.rows[0].count);

    sql += ` ORDER BY m.fecha DESC, m.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error obteniendo movimientos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// TRASPASOS
// ════════════════════════════════════════════════════════════

// POST /api/almacenes/traspaso
const traspaso = async (req, res) => {
  const { almacen_origen_id, almacen_destino_id, items, proyecto_id, referencia, notas, fecha } = req.body;
  // items = [{ producto_id, cantidad, costo_unitario, costo_moneda, tipo_cambio }]

  if (!items || !items.length) return res.status(400).json({ error: 'Se requiere al menos un producto' });
  if (almacen_origen_id === almacen_destino_id) return res.status(400).json({ error: 'El almacen origen y destino deben ser diferentes' });

  try {
    const resultado = await withTransaction(async (client) => {
      const movIds = [];
      const fechaMov = fecha || new Date().toISOString().split('T')[0];

      for (const item of items) {
        const tc    = parseFloat(item.tipo_cambio || 1);
        const cu    = parseFloat(item.costo_unitario || 0);
        const cuMxn = item.costo_moneda === 'MXN' ? cu : cu * tc;
        const cant  = parseFloat(item.cantidad);

        // Verificar stock en origen
        const stockRes = await client.query(
          'SELECT stock_actual FROM inventario WHERE producto_id=$1 AND almacen_id=$2',
          [item.producto_id, almacen_origen_id]
        );
        const stockOrigen = parseFloat(stockRes.rows[0]?.stock_actual || 0);
        if (stockOrigen < cant) {
          const prodRes = await client.query('SELECT nombre FROM productos_servicios WHERE id=$1', [item.producto_id]);
          throw new Error(`Stock insuficiente para "${prodRes.rows[0]?.nombre}". Disponible: ${stockOrigen}, Requerido: ${cant}`);
        }

        // Salida del origen
        const movSalida = await client.query(`
          INSERT INTO movimientos_inventario
            (producto_id, almacen_origen_id, almacen_destino_id, tipo, cantidad,
             costo_unitario, costo_moneda, tipo_cambio, costo_unitario_mxn,
             costo_total_mxn, proyecto_id, referencia, notas, fecha, creado_por)
          VALUES ($1,$2,$3,'traspaso_salida',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id
        `, [item.producto_id, almacen_origen_id, almacen_destino_id,
            cant, cu, item.costo_moneda||'MXN', tc, cuMxn, cuMxn*cant,
            proyecto_id||null, referencia||null, notas||null, fechaMov, req.usuario.id]);

        // Entrada al destino
        await client.query(`
          INSERT INTO movimientos_inventario
            (producto_id, almacen_origen_id, almacen_destino_id, tipo, cantidad,
             costo_unitario, costo_moneda, tipo_cambio, costo_unitario_mxn,
             costo_total_mxn, proyecto_id, referencia, notas, fecha, creado_por)
          VALUES ($1,$2,$3,'traspaso_entrada',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        `, [item.producto_id, almacen_origen_id, almacen_destino_id,
            cant, cu, item.costo_moneda||'MXN', tc, cuMxn, cuMxn*cant,
            proyecto_id||null, referencia||null, notas||null, fechaMov, req.usuario.id]);

        // Recalcular stock en ambos almacenes
        await client.query('SELECT recalcular_stock($1,$2)', [item.producto_id, almacen_origen_id]);
        await client.query('SELECT recalcular_stock($1,$2)', [item.producto_id, almacen_destino_id]);

        movIds.push(movSalida.rows[0].id);
      }

      return { movimientos: movIds.length, ids: movIds };
    });

    logger.info('Traspaso registrado', { origen: almacen_origen_id, destino: almacen_destino_id, items: items.length });
    return res.status(201).json({
      ok: true,
      message: `Traspaso de ${items.length} producto(s) registrado correctamente`,
      datos: resultado
    });

  } catch (err) {
    if (err.message.includes('Stock insuficiente')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('Error en traspaso:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// IMPORTACIÓN CSV
// ════════════════════════════════════════════════════════════

// POST /api/almacenes/:id/importar-csv
// El CSV ya fue parseado en el frontend; llegan los datos como JSON
const importarCSV = async (req, res) => {
  const { id } = req.params;
  const { modo, filas, mapeo } = req.body;
  // filas = [{ codigo, nombre, cantidad, costo, unidad_medida, ... }]

  if (!['reemplazar','agregar'].includes(modo)) {
    return res.status(400).json({ error: 'Modo debe ser: reemplazar o agregar' });
  }

  try {
    const almacenRes = await query('SELECT * FROM almacenes WHERE id=$1', [id]);
    if (!almacenRes.rows.length) return res.status(404).json({ error: 'Almacen no encontrado' });
    const almacen = almacenRes.rows[0];

    const errores = [];
    let importadas = 0;
    const fecha = new Date().toISOString().split('T')[0];

    await withTransaction(async (client) => {
      // Registrar importación
      const impRes = await client.query(`
        INSERT INTO importaciones_csv (almacen_id, modo, total_filas, mapeo_columnas, importado_por)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [id, modo, filas.length, JSON.stringify(mapeo||{}), req.usuario.id]);
      const impId = impRes.rows[0].id;

      if (modo === 'reemplazar') {
        // Registrar ajuste a cero para todos los productos actuales
        const actuales = await client.query(
          'SELECT producto_id, stock_actual FROM inventario WHERE almacen_id=$1 AND stock_actual>0',
          [id]
        );
        for (const act of actuales.rows) {
          await client.query(`
            INSERT INTO movimientos_inventario
              (producto_id, almacen_origen_id, tipo, cantidad, costo_moneda, importacion_id, fecha, creado_por)
            VALUES ($1,$2,'ajuste_negativo',$3,$4,$5,$6,$7)
          `, [act.producto_id, id, act.stock_actual, almacen.moneda_valuacion, impId, fecha, req.usuario.id]);
          await client.query('SELECT recalcular_stock($1,$2)', [act.producto_id, id]);
        }
      }

      for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        try {
          // Buscar producto por código
          let prodId = null;
          if (fila.codigo) {
            const pRes = await client.query(
              'SELECT id FROM productos_servicios WHERE codigo=$1 AND activo=true',
              [fila.codigo.trim()]
            );
            if (pRes.rows.length) prodId = pRes.rows[0].id;
          }
          // Si no encontró por código, buscar por nombre
          if (!prodId && fila.nombre) {
            const pRes = await client.query(
              'SELECT id FROM productos_servicios WHERE LOWER(nombre) = LOWER($1) AND activo=true LIMIT 1',
              [fila.nombre.trim()]
            );
            if (pRes.rows.length) prodId = pRes.rows[0].id;
          }
          // Si no existe el producto, crearlo
          if (!prodId) {
            const pIns = await client.query(`
              INSERT INTO productos_servicios (codigo, nombre, tipo, unidad_medida, costo_mxn, controla_inventario, creado_por)
              VALUES ($1,$2,'Suministro',$3,$4,true,$5) RETURNING id
            `, [fila.codigo||null, fila.nombre||`Producto fila ${i+1}`,
                fila.unidad_medida||'Pieza', parseFloat(fila.costo||0), req.usuario.id]);
            prodId = pIns.rows[0].id;
          }

          const cantidad = parseFloat(fila.cantidad || 0);
          const costo    = parseFloat(fila.costo || 0);
          if (cantidad <= 0) { errores.push({ fila: i+1, error: 'Cantidad debe ser > 0' }); continue; }

          // Registrar entrada
          await client.query(`
            INSERT INTO movimientos_inventario
              (producto_id, almacen_destino_id, tipo, cantidad,
               costo_unitario, costo_moneda, costo_unitario_mxn, costo_total_mxn,
               importacion_id, fecha, creado_por)
            VALUES ($1,$2,'importacion_csv',$3,$4,$5,$4,$6,$7,$8,$9)
          `, [prodId, id, cantidad, costo, almacen.moneda_valuacion,
              costo*cantidad, impId, fecha, req.usuario.id]);

          await client.query('SELECT recalcular_stock($1,$2)', [prodId, id]);
          importadas++;

        } catch (filaErr) {
          errores.push({ fila: i+1, error: filaErr.message });
        }
      }

      // Actualizar totales de la importación
      await client.query(`
        UPDATE importaciones_csv SET filas_importadas=$1, filas_con_error=$2, errores=$3 WHERE id=$4
      `, [importadas, errores.length, JSON.stringify(errores), impId]);
    });

    logger.info('CSV importado', { almacen: id, modo, importadas, errores: errores.length });
    return res.json({
      ok: true,
      message: `Importación completada: ${importadas} productos procesados, ${errores.length} errores`,
      datos: { importadas, errores }
    });

  } catch (err) {
    logger.error('Error importando CSV:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// EXPORTAR A EXCEL (datos para SheetJS en frontend)
// GET /api/almacenes/:id/exportar
// ════════════════════════════════════════════════════════════
const exportarInventario = async (req, res) => {
  try {
    const { id } = req.params;
    const almacenRes = await query('SELECT clave, nombre FROM almacenes WHERE id=$1', [id]);
    if (!almacenRes.rows.length) return res.status(404).json({ error: 'Almacen no encontrado' });

    const result = await query(`
      SELECT
        ps.codigo                 AS "Codigo",
        ps.nombre                 AS "Descripcion",
        ps.tipo                   AS "Tipo",
        c.nombre                  AS "Categoria",
        ps.unidad_medida          AS "Unidad",
        i.stock_actual            AS "Stock Actual",
        ps.stock_minimo           AS "Stock Minimo",
        i.costo_promedio          AS "Costo Promedio",
        i.costo_moneda            AS "Moneda Costo",
        i.costo_promedio_mxn      AS "Costo MXN",
        ROUND(i.stock_actual * i.costo_promedio_mxn, 2) AS "Valor Total MXN",
        CASE
          WHEN i.stock_actual <= 0             THEN 'SIN STOCK'
          WHEN i.stock_actual <= ps.stock_minimo THEN 'STOCK BAJO'
          ELSE 'OK'
        END                       AS "Alerta",
        TO_CHAR(i.ultima_actualizacion,'DD/MM/YYYY HH24:MI') AS "Ultima Actualizacion"
      FROM inventario i
      JOIN productos_servicios ps ON i.producto_id = ps.id
      LEFT JOIN categorias_producto c ON ps.categoria_id = c.id
      WHERE i.almacen_id = $1
      ORDER BY ps.tipo, ps.nombre
    `, [id]);

    return res.json({
      ok: true,
      almacen: almacenRes.rows[0],
      datos: result.rows,
      total: result.rowCount,
      exportado_en: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Error exportando inventario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/almacenes/resumen  — KPIs para dashboard
const resumen = async (req, res) => {
  try {
    const generales = await query(`
      SELECT a.clave, a.nombre, a.tipo, a.moneda_valuacion,
        COUNT(DISTINCT i.producto_id) AS total_productos,
        COALESCE(SUM(i.stock_actual * i.costo_promedio_mxn),0) AS valor_mxn,
        COUNT(DISTINCT i.producto_id) FILTER (WHERE i.stock_actual <= 0) AS sin_stock,
        COUNT(DISTINCT i.producto_id) FILTER (WHERE i.stock_actual > 0 AND i.stock_actual <= ps.stock_minimo) AS stock_bajo
      FROM almacenes a
      LEFT JOIN inventario i ON i.almacen_id = a.id
      LEFT JOIN productos_servicios ps ON i.producto_id = ps.id
      WHERE a.tipo IN ('general_mxn','general_usd','general_rst')
      GROUP BY a.id, a.clave, a.nombre, a.tipo, a.moneda_valuacion
      ORDER BY a.tipo
    `);

    const folios = await query(`
      SELECT COUNT(*) AS total_almacenes_folio,
        COALESCE(SUM(i.stock_actual * i.costo_promedio_mxn),0) AS valor_total_mxn
      FROM almacenes a
      LEFT JOIN inventario i ON i.almacen_id = a.id
      WHERE a.tipo = 'folio' AND a.activo = true
    `);

    return res.json({
      ok: true,
      generales: generales.rows,
      folios: folios.rows[0],
    });
  } catch (err) {
    logger.error('Error en resumen almacenes:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listar, obtener, crear, actualizar,
  inventarioAlmacen, stockProducto, movimientosAlmacen,
  registrarMovimiento, traspaso,
  importarCSV, exportarInventario, resumen,
};
