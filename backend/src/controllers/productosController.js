const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ── GET /api/productos ────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const { search, tipo, activo, es_rst, categoria_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT ps.*,
        c.nombre AS categoria_nombre,
        p.nombre AS proveedor_nombre
      FROM productos_servicios ps
      LEFT JOIN categorias_producto c ON ps.categoria_id = c.id
      LEFT JOIN proveedores p ON ps.proveedor_preferido_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (activo !== undefined) { sql += ` AND ps.activo = $${idx++}`; params.push(activo === 'true'); }
    if (tipo) { sql += ` AND ps.tipo = $${idx++}`; params.push(tipo); }
    if (categoria_id) { sql += ` AND ps.categoria_id = $${idx++}`; params.push(categoria_id); }
    if (es_rst !== undefined) { sql += ` AND ps.es_producto_rst = $${idx++}`; params.push(es_rst === 'true'); }
    if (search) {
      sql += ` AND (ps.nombre ILIKE $${idx} OR ps.codigo ILIKE $${idx} OR ps.descripcion ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countRes.rows[0].count);

    sql += ` ORDER BY ps.tipo, ps.nombre LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error listando productos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/productos/:id ────────────────────────────────────
const obtener = async (req, res) => {
  try {
    const result = await query(`
      SELECT ps.*, c.nombre AS categoria_nombre, p.nombre AS proveedor_nombre
      FROM productos_servicios ps
      LEFT JOIN categorias_producto c ON ps.categoria_id = c.id
      LEFT JOIN proveedores p ON ps.proveedor_preferido_id = p.id
      WHERE ps.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error obteniendo producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/productos ───────────────────────────────────────
const crear = async (req, res) => {
  try {
    const data = req.body;
    const resultado = await withTransaction(async (client) => {
      const ins = await client.query(`
        INSERT INTO productos_servicios
          (codigo, nombre, descripcion, tipo, categoria_id, unidad_medida,
           precio_venta_mxn, precio_venta_usd, costo_mxn, costo_usd,
           aplica_iva, tasa_iva, controla_inventario, stock_minimo,
           es_producto_rst, proveedor_preferido_id, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id, codigo, nombre
      `, [
        data.codigo || null, data.nombre, data.descripcion || null,
        data.tipo, data.categoria_id || null, data.unidad_medida || null,
        data.precio_venta_mxn || null, data.precio_venta_usd || null,
        data.costo_mxn || null, data.costo_usd || null,
        data.aplica_iva !== false, data.tasa_iva || 16,
        data.controla_inventario || false, data.stock_minimo || 0,
        data.es_producto_rst || false, data.proveedor_preferido_id || null,
        data.notas || null, req.usuario.id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1,'productos_servicios',$2,'INSERT',$3,$4)
      `, [req.usuario.id, ins.rows[0].id, JSON.stringify({ nombre: data.nombre, tipo: data.tipo }), req.ip]);

      return ins.rows[0];
    });
    return res.status(201).json({ ok: true, datos: resultado });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El codigo ya existe' });
    logger.error('Error creando producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/productos/:id ────────────────────────────────────
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const anterior = await query('SELECT * FROM productos_servicios WHERE id = $1', [id]);
    if (!anterior.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE productos_servicios SET
          nombre=$1, descripcion=$2, tipo=$3, categoria_id=$4, unidad_medida=$5,
          precio_venta_mxn=$6, precio_venta_usd=$7, costo_mxn=$8, costo_usd=$9,
          aplica_iva=$10, tasa_iva=$11, controla_inventario=$12, stock_minimo=$13,
          es_producto_rst=$14, proveedor_preferido_id=$15, notas=$16, activo=$17
        WHERE id=$18
      `, [
        data.nombre, data.descripcion, data.tipo, data.categoria_id,
        data.unidad_medida, data.precio_venta_mxn, data.precio_venta_usd,
        data.costo_mxn, data.costo_usd, data.aplica_iva !== false,
        data.tasa_iva || 16, data.controla_inventario || false,
        data.stock_minimo || 0, data.es_producto_rst || false,
        data.proveedor_preferido_id, data.notas, data.activo !== false, id
      ]);
      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_anteriores,datos_nuevos,ip_address) VALUES ($1,'productos_servicios',$2,'UPDATE',$3,$4,$5)`,
        [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(data), req.ip]);
    });
    return res.json({ ok: true, message: 'Producto actualizado' });
  } catch (err) {
    logger.error('Error actualizando producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const desactivar = async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query('UPDATE productos_servicios SET activo=false WHERE id=$1', [req.params.id]);
      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,ip_address) VALUES ($1,'productos_servicios',$2,'DESACTIVAR',$3)`,
        [req.usuario.id, req.params.id, req.ip]);
    });
    return res.json({ ok: true, message: 'Producto desactivado' });
  } catch (err) {
    logger.error('Error desactivando producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/categorias ───────────────────────────────────────
const listarCategorias = async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, padre.nombre AS padre_nombre,
        (SELECT COUNT(*) FROM productos_servicios ps WHERE ps.categoria_id = c.id) AS total_productos
      FROM categorias_producto c
      LEFT JOIN categorias_producto padre ON c.padre_id = padre.id
      WHERE c.activo = true ORDER BY c.tipo, c.nombre
    `);
    return res.json({ ok: true, datos: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar, desactivar, listarCategorias };
