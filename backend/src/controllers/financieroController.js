const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ════════════════════════════════════════════════════════════
// TIPOS DE CAMBIO
// ════════════════════════════════════════════════════════════

// ── GET /api/tipos-cambio ─────────────────────────────────────
const listarTiposCambio = async (req, res) => {
  try {
    const { fecha, moneda, limit = 30 } = req.query;
    let sql = `SELECT tc.*, u.nombre AS registrado_por_nombre
               FROM tipos_cambio tc
               LEFT JOIN usuarios u ON tc.registrado_por = u.id
               WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (fecha) { sql += ` AND tc.fecha = $${idx++}`; params.push(fecha); }
    if (moneda) { sql += ` AND tc.moneda = $${idx++}`; params.push(moneda); }
    sql += ` ORDER BY tc.fecha DESC, tc.moneda LIMIT $${idx++}`;
    params.push(limit);
    const result = await query(sql, params);
    return res.json({ ok: true, datos: result.rows });
  } catch (err) {
    logger.error('Error listando tipos de cambio:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/tipos-cambio/hoy ─────────────────────────────────
const tiposCambioHoy = async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const result = await query(`
      SELECT * FROM tipos_cambio
      WHERE fecha = $1 ORDER BY moneda
    `, [hoy]);

    // Organizar en objeto por moneda para fácil acceso
    const cambios = {};
    result.rows.forEach(r => { cambios[r.moneda] = r; });

    return res.json({ ok: true, fecha: hoy, datos: cambios, lista: result.rows });
  } catch (err) {
    logger.error('Error obteniendo TC de hoy:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/tipos-cambio ────────────────────────────────────
const registrarTipoCambio = async (req, res) => {
  try {
    const { fecha, moneda, a_mxn, a_usd, fuente } = req.body;
    const result = await query(`
      INSERT INTO tipos_cambio (fecha, moneda, a_mxn, a_usd, fuente, registrado_por)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (fecha, moneda) DO UPDATE SET
        a_mxn = EXCLUDED.a_mxn, a_usd = EXCLUDED.a_usd,
        fuente = EXCLUDED.fuente, registrado_por = EXCLUDED.registrado_por
      RETURNING *
    `, [fecha, moneda, a_mxn, a_usd || null, fuente || 'Manual', req.usuario.id]);

    logger.info('Tipo de cambio registrado', { fecha, moneda, a_mxn });
    return res.status(201).json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error registrando tipo de cambio:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/tipos-cambio/bulk ───────────────────────────────
// Registrar múltiples monedas a la vez (ej. al inicio del día)
const registrarTipoCambioBulk = async (req, res) => {
  try {
    const { fecha, tipos } = req.body;
    // tipos = [{ moneda: 'USD', a_mxn: 17.24, a_usd: 1 }, ...]
    const resultados = [];
    await withTransaction(async (client) => {
      for (const t of tipos) {
        const r = await client.query(`
          INSERT INTO tipos_cambio (fecha, moneda, a_mxn, a_usd, fuente, registrado_por)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (fecha, moneda) DO UPDATE SET
            a_mxn = EXCLUDED.a_mxn, a_usd = EXCLUDED.a_usd,
            fuente = EXCLUDED.fuente, registrado_por = EXCLUDED.registrado_por
          RETURNING *
        `, [fecha, t.moneda, t.a_mxn, t.a_usd || null, t.fuente || 'Manual', req.usuario.id]);
        resultados.push(r.rows[0]);
      }
    });
    return res.status(201).json({ ok: true, datos: resultados });
  } catch (err) {
    logger.error('Error en bulk TC:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── Convertir monto a MXN ─────────────────────────────────────
// Utility: GET /api/tipos-cambio/convertir?monto=100&moneda=USD&fecha=2026-04-02
const convertir = async (req, res) => {
  try {
    const { monto, moneda, fecha } = req.query;
    if (moneda === 'MXN') return res.json({ ok: true, mxn: parseFloat(monto), tc: 1 });

    const fechaBuscar = fecha || new Date().toISOString().split('T')[0];
    const result = await query(`
      SELECT a_mxn FROM tipos_cambio
      WHERE moneda = $1 AND fecha <= $2
      ORDER BY fecha DESC LIMIT 1
    `, [moneda, fechaBuscar]);

    if (!result.rows.length) {
      return res.status(404).json({ error: `No hay tipo de cambio para ${moneda} en ${fechaBuscar}` });
    }

    const tc = parseFloat(result.rows[0].a_mxn);
    const mxn = parseFloat(monto) * tc;
    return res.json({ ok: true, monto_original: parseFloat(monto), moneda, tc, mxn: parseFloat(mxn.toFixed(2)) });
  } catch (err) {
    logger.error('Error convirtiendo moneda:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// CUENTAS BANCARIAS
// ════════════════════════════════════════════════════════════

const listarCuentas = async (req, res) => {
  try {
    const result = await query(`
      SELECT cb.*, un.codigo AS unidad_codigo, un.nombre AS unidad_nombre
      FROM cuentas_bancarias cb
      LEFT JOIN unidades_negocio un ON cb.unidad_negocio_id = un.id
      WHERE cb.activo = true ORDER BY cb.moneda, cb.banco
    `);
    return res.json({ ok: true, datos: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crearCuenta = async (req, res) => {
  try {
    const { banco, nombre_cuenta, numero_cuenta, clabe, moneda, saldo_inicial, unidad_negocio_id, notas } = req.body;
    const result = await query(`
      INSERT INTO cuentas_bancarias (banco, nombre_cuenta, numero_cuenta, clabe, moneda, saldo_inicial, unidad_negocio_id, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [banco, nombre_cuenta, numero_cuenta || null, clabe || null, moneda || 'MXN', saldo_inicial || 0, unidad_negocio_id || null, notas || null]);
    return res.status(201).json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error creando cuenta bancaria:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarCuenta = async (req, res) => {
  try {
    const { id } = req.params;
    const { banco, nombre_cuenta, numero_cuenta, clabe, moneda, unidad_negocio_id, activo, notas } = req.body;
    await query(`
      UPDATE cuentas_bancarias SET banco=$1, nombre_cuenta=$2, numero_cuenta=$3, clabe=$4,
        moneda=$5, unidad_negocio_id=$6, activo=$7, notas=$8 WHERE id=$9
    `, [banco, nombre_cuenta, numero_cuenta, clabe, moneda, unidad_negocio_id, activo !== false, notas, id]);
    return res.json({ ok: true, message: 'Cuenta actualizada' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// CARTERAS CRIPTO
// ════════════════════════════════════════════════════════════

const listarCarteras = async (req, res) => {
  try {
    const result = await query(`
      SELECT cc.*, un.codigo AS unidad_codigo
      FROM carteras_cripto cc
      LEFT JOIN unidades_negocio un ON cc.unidad_negocio_id = un.id
      WHERE cc.activo = true ORDER BY cc.moneda, cc.nombre
    `);
    return res.json({ ok: true, datos: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crearCartera = async (req, res) => {
  try {
    const { nombre, moneda, direccion_wallet, red, exchange, saldo_inicial, unidad_negocio_id, notas } = req.body;
    const result = await query(`
      INSERT INTO carteras_cripto (nombre, moneda, direccion_wallet, red, exchange, saldo_inicial, unidad_negocio_id, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [nombre, moneda, direccion_wallet || null, red || null, exchange || 'Binance', saldo_inicial || 0, unidad_negocio_id || null, notas || null]);
    return res.status(201).json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    logger.error('Error creando cartera:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarCartera = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, direccion_wallet, red, exchange, unidad_negocio_id, activo, notas } = req.body;
    await query(`
      UPDATE carteras_cripto SET nombre=$1, direccion_wallet=$2, red=$3,
        exchange=$4, unidad_negocio_id=$5, activo=$6, notas=$7 WHERE id=$8
    `, [nombre, direccion_wallet, red, exchange, unidad_negocio_id, activo !== false, notas, id]);
    return res.json({ ok: true, message: 'Cartera actualizada' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listarTiposCambio, tiposCambioHoy, registrarTipoCambio,
  registrarTipoCambioBulk, convertir,
  listarCuentas, crearCuenta, actualizarCuenta,
  listarCarteras, crearCartera, actualizarCartera,
};
