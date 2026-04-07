const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// Helper para generar codigo automatico
const generarCodigo = async (client, prefijo) => {
  const res = await client.query(
    `SELECT COUNT(*) as total FROM clientes WHERE codigo LIKE $1`,
    [`${prefijo}-%`]
  );
  const num = String(parseInt(res.rows[0].total) + 1).padStart(4, '0');
  return `${prefijo}-${num}`;
};

// ── GET /api/clientes ─────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const { search, activo, unidad_id, moneda, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT c.*,
        un.codigo AS unidad_codigo, un.nombre AS unidad_nombre,
        (SELECT COUNT(*) FROM ingresos i WHERE i.cliente_id = c.id) AS total_proyectos,
        (SELECT COALESCE(SUM(i.total_mxn),0) FROM ingresos i
         WHERE i.cliente_id = c.id AND i.estado_cobro != 'Cobrado') AS saldo_pendiente_mxn
      FROM clientes c
      LEFT JOIN unidades_negocio un ON c.unidad_negocio_id = un.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (activo !== undefined) { sql += ` AND c.activo = $${idx++}`; params.push(activo === 'true'); }
    if (unidad_id) { sql += ` AND c.unidad_negocio_id = $${idx++}`; params.push(unidad_id); }
    if (moneda) { sql += ` AND c.moneda_preferida = $${idx++}`; params.push(moneda); }
    if (search) {
      sql += ` AND (c.nombre ILIKE $${idx} OR c.rfc ILIKE $${idx} OR c.codigo ILIKE $${idx} OR c.email ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND c.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    // Total para paginación
    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countRes.rows[0].count);

    sql += ` ORDER BY c.nombre LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });

  } catch (err) {
    logger.error('Error listando clientes:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/clientes/:id ─────────────────────────────────────
const obtener = async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*,
        un.codigo AS unidad_codigo, un.nombre AS unidad_nombre,
        u.nombre || ' ' || COALESCE(u.apellidos,'') AS creado_por_nombre
      FROM clientes c
      LEFT JOIN unidades_negocio un ON c.unidad_negocio_id = un.id
      LEFT JOIN usuarios u ON c.creado_por = u.id
      WHERE c.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    return res.json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error obteniendo cliente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/clientes ────────────────────────────────────────
const crear = async (req, res) => {
  try {
    const data = req.body;

    const resultado = await withTransaction(async (client) => {
      const codigo = data.codigo || await generarCodigo(client, 'CLI');

      const ins = await client.query(`
        INSERT INTO clientes
          (codigo, nombre, rfc, tipo, sector, direccion, ciudad, estado_geo, pais,
           codigo_postal, telefono, email, sitio_web, contacto_nombre, contacto_email,
           contacto_tel, contacto_puesto, moneda_preferida, credito_limite, credito_dias,
           unidad_negocio_id, notas, creado_por)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        RETURNING id, codigo, nombre
      `, [
        codigo, data.nombre, data.rfc || null, data.tipo || 'Empresa',
        data.sector || null, data.direccion || null, data.ciudad || null,
        data.estado_geo || null, data.pais || 'Mexico', data.codigo_postal || null,
        data.telefono || null, data.email || null, data.sitio_web || null,
        data.contacto_nombre || null, data.contacto_email || null,
        data.contacto_tel || null, data.contacto_puesto || null,
        data.moneda_preferida || 'MXN',
        data.credito_limite || 0, data.credito_dias || 30,
        data.unidad_negocio_id || null, data.notas || null,
        req.usuario.id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1,'clientes',$2,$3,$4,$5)
      `, [req.usuario.id, ins.rows[0].id, 'INSERT', JSON.stringify({ nombre: data.nombre, codigo }), req.ip]);

      return ins.rows[0];
    });

    logger.info('Cliente creado', { id: resultado.id, nombre: resultado.nombre });
    return res.status(201).json({ ok: true, datos: resultado });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El codigo o RFC ya existe' });
    logger.error('Error creando cliente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/clientes/:id ─────────────────────────────────────
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const anterior = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    if (!anterior.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE clientes SET
          nombre=$1, rfc=$2, tipo=$3, sector=$4, direccion=$5, ciudad=$6,
          estado_geo=$7, pais=$8, codigo_postal=$9, telefono=$10, email=$11,
          sitio_web=$12, contacto_nombre=$13, contacto_email=$14, contacto_tel=$15,
          contacto_puesto=$16, moneda_preferida=$17, credito_limite=$18,
          credito_dias=$19, unidad_negocio_id=$20, notas=$21, activo=$22,
          actualizado_en=NOW()
        WHERE id=$23
      `, [
        data.nombre, data.rfc, data.tipo, data.sector, data.direccion,
        data.ciudad, data.estado_geo, data.pais || 'Mexico', data.codigo_postal,
        data.telefono, data.email, data.sitio_web, data.contacto_nombre,
        data.contacto_email, data.contacto_tel, data.contacto_puesto,
        data.moneda_preferida || 'MXN', data.credito_limite || 0,
        data.credito_dias || 30, data.unidad_negocio_id, data.notas,
        data.activo !== false, id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos, ip_address)
        VALUES ($1,'clientes',$2,'UPDATE',$3,$4,$5)
      `, [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(data), req.ip]);
    });

    return res.json({ ok: true, message: 'Cliente actualizado correctamente' });
  } catch (err) {
    logger.error('Error actualizando cliente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DELETE /api/clientes/:id (desactivar) ─────────────────────
const desactivar = async (req, res) => {
  try {
    const { id } = req.params;
    await withTransaction(async (client) => {
      await client.query('UPDATE clientes SET activo=false, actualizado_en=NOW() WHERE id=$1', [id]);
      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
        VALUES ($1,'clientes',$2,'DESACTIVAR',$3)
      `, [req.usuario.id, id, req.ip]);
    });
    return res.json({ ok: true, message: 'Cliente desactivado' });
  } catch (err) {
    logger.error('Error desactivando cliente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar, desactivar };
