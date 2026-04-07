const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

const generarCodigo = async (client) => {
  const res = await client.query(`SELECT COUNT(*) as total FROM proveedores`);
  return `PROV-${String(parseInt(res.rows[0].total) + 1).padStart(4, '0')}`;
};

// ── GET /api/proveedores ──────────────────────────────────────
const listar = async (req, res) => {
  try {
    const { search, activo, es_rst, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM ordenes_compra oc WHERE oc.proveedor_id = p.id) AS total_ordenes
      FROM proveedores p WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (activo !== undefined) { sql += ` AND p.activo = $${idx++}`; params.push(activo === 'true'); }
    if (es_rst !== undefined) { sql += ` AND p.es_proveedor_rst = $${idx++}`; params.push(es_rst === 'true'); }
    if (search) {
      sql += ` AND (p.nombre ILIKE $${idx} OR p.rfc ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.email ILIKE $${idx} OR p.giro ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countRes.rows[0].count);

    sql += ` ORDER BY p.nombre LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });
  } catch (err) {
    logger.error('Error listando proveedores:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/proveedores/:id ──────────────────────────────────
const obtener = async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, u.nombre || ' ' || COALESCE(u.apellidos,'') AS creado_por_nombre
      FROM proveedores p
      LEFT JOIN usuarios u ON p.creado_por = u.id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    return res.json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error obteniendo proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/proveedores ─────────────────────────────────────
const crear = async (req, res) => {
  try {
    const data = req.body;
    const resultado = await withTransaction(async (client) => {
      const codigo = data.codigo || await generarCodigo(client);
      const ins = await client.query(`
        INSERT INTO proveedores
          (codigo, nombre, rfc, tipo, giro, direccion, ciudad, estado_geo, pais,
           codigo_postal, telefono, email, email_compras, sitio_web,
           contacto_nombre, contacto_email, contacto_tel,
           moneda_preferida, dias_credito, wallet_cripto, red_cripto,
           banco, cuenta_clabe, es_proveedor_rst, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING id, codigo, nombre
      `, [
        codigo, data.nombre, data.rfc || null,
        data.tipo || 'Empresa', data.giro || null,
        data.direccion || null, data.ciudad || null, data.estado_geo || null,
        data.pais || 'Mexico', data.codigo_postal || null,
        data.telefono || null, data.email || null, data.email_compras || null,
        data.sitio_web || null, data.contacto_nombre || null,
        data.contacto_email || null, data.contacto_tel || null,
        data.moneda_preferida || 'MXN', data.dias_credito || 30,
        data.wallet_cripto || null, data.red_cripto || null,
        data.banco || null, data.cuenta_clabe || null,
        data.es_proveedor_rst || false, data.notas || null,
        req.usuario.id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1,'proveedores',$2,'INSERT',$3,$4)
      `, [req.usuario.id, ins.rows[0].id, JSON.stringify({ nombre: data.nombre }), req.ip]);

      return ins.rows[0];
    });

    return res.status(201).json({ ok: true, datos: resultado });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El codigo ya existe' });
    logger.error('Error creando proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/proveedores/:id ──────────────────────────────────
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const anterior = await query('SELECT * FROM proveedores WHERE id = $1', [id]);
    if (!anterior.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE proveedores SET
          nombre=$1, rfc=$2, tipo=$3, giro=$4, direccion=$5, ciudad=$6,
          estado_geo=$7, pais=$8, codigo_postal=$9, telefono=$10, email=$11,
          email_compras=$12, sitio_web=$13, contacto_nombre=$14, contacto_email=$15,
          contacto_tel=$16, moneda_preferida=$17, dias_credito=$18,
          wallet_cripto=$19, red_cripto=$20, banco=$21, cuenta_clabe=$22,
          es_proveedor_rst=$23, notas=$24, activo=$25, actualizado_en=NOW()
        WHERE id=$26
      `, [
        data.nombre, data.rfc, data.tipo, data.giro, data.direccion,
        data.ciudad, data.estado_geo, data.pais || 'Mexico', data.codigo_postal,
        data.telefono, data.email, data.email_compras, data.sitio_web,
        data.contacto_nombre, data.contacto_email, data.contacto_tel,
        data.moneda_preferida || 'MXN', data.dias_credito || 30,
        data.wallet_cripto, data.red_cripto, data.banco, data.cuenta_clabe,
        data.es_proveedor_rst || false, data.notas, data.activo !== false, id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos, ip_address)
        VALUES ($1,'proveedores',$2,'UPDATE',$3,$4,$5)
      `, [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(data), req.ip]);
    });

    return res.json({ ok: true, message: 'Proveedor actualizado' });
  } catch (err) {
    logger.error('Error actualizando proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const desactivar = async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query('UPDATE proveedores SET activo=false, actualizado_en=NOW() WHERE id=$1', [req.params.id]);
      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,ip_address) VALUES ($1,'proveedores',$2,'DESACTIVAR',$3)`,
        [req.usuario.id, req.params.id, req.ip]);
    });
    return res.json({ ok: true, message: 'Proveedor desactivado' });
  } catch (err) {
    logger.error('Error desactivando proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar, desactivar };
