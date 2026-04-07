/**
 * catalogController.js
 * Factory que genera controladores CRUD completos para cualquier catálogo.
 * Incluye: listar (con filtros + paginación), obtener, crear, actualizar,
 * desactivar (lógico) y exportar a CSV.
 */
const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ── Genera un folio/código automático ────────────────────────
const generarCodigo = async (client, prefijo, tabla, campoCodigo = 'codigo') => {
  const res = await client.query(
    `SELECT COUNT(*) as total FROM ${tabla} WHERE ${campoCodigo} LIKE $1`,
    [`${prefijo}-%`]
  );
  const n = parseInt(res.rows[0].total) + 1;
  return `${prefijo}-${String(n).padStart(3, '0')}`;
};

// ════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════
const clientes = {

  listar: async (req, res) => {
    try {
      const { search, unidad_id, activo = 'true', moneda, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const params = [];
      let idx = 1;
      let where = 'WHERE 1=1';

      if (activo !== 'all') { where += ` AND c.activo = $${idx++}`; params.push(activo === 'true'); }
      if (unidad_id)        { where += ` AND c.unidad_negocio_id = $${idx++}`; params.push(unidad_id); }
      if (moneda)           { where += ` AND c.moneda_preferida = $${idx++}`; params.push(moneda); }
      if (search) {
        where += ` AND (c.nombre ILIKE $${idx} OR c.rfc ILIKE $${idx} OR c.email ILIKE $${idx} OR c.codigo ILIKE $${idx})`;
        params.push(`%${search}%`); idx++;
      }
      if (req.unidadFiltro) { where += ` AND c.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

      const countRes = await query(`SELECT COUNT(*) FROM clientes c ${where}`, params);
      const total = parseInt(countRes.rows[0].count);

      const dataRes = await query(`
        SELECT c.*, un.codigo as unidad_codigo, un.nombre as unidad_nombre,
               u.nombre as creado_por_nombre
        FROM clientes c
        LEFT JOIN unidades_negocio un ON c.unidad_negocio_id = un.id
        LEFT JOIN usuarios u ON c.creado_por = u.id
        ${where}
        ORDER BY c.nombre
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, parseInt(limit), offset]);

      return res.json({ ok: true, total, pagina: parseInt(page), datos: dataRes.rows });
    } catch (err) {
      logger.error('Error listando clientes:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  obtener: async (req, res) => {
    try {
      const result = await query(`
        SELECT c.*, un.codigo as unidad_codigo, un.nombre as unidad_nombre
        FROM clientes c
        LEFT JOIN unidades_negocio un ON c.unidad_negocio_id = un.id
        WHERE c.id = $1
      `, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      return res.json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error obteniendo cliente:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crear: async (req, res) => {
    try {
      const datos = req.body;
      const result = await withTransaction(async (client) => {
        if (!datos.codigo) {
          datos.codigo = await generarCodigo(client, 'CLI', 'clientes');
        }
        const ins = await client.query(`
          INSERT INTO clientes
            (codigo,nombre,rfc,tipo,sector,direccion,ciudad,estado,pais,
             telefono,email,contacto_nombre,contacto_email,contacto_tel,
             moneda_preferida,credito_limite,credito_dias,unidad_negocio_id,notas,creado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          RETURNING id, codigo, nombre
        `, [
          datos.codigo, datos.nombre, datos.rfc||null, datos.tipo||'Empresa',
          datos.sector||null, datos.direccion||null, datos.ciudad||null,
          datos.estado||null, datos.pais||'Mexico', datos.telefono||null,
          datos.email||null, datos.contacto_nombre||null, datos.contacto_email||null,
          datos.contacto_tel||null, datos.moneda_preferida||'MXN',
          datos.credito_limite||0, datos.credito_dias||30,
          datos.unidad_negocio_id||null, datos.notas||null, req.usuario.id
        ]);
        await client.query(
          `INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
           VALUES ($1,'clientes',$2,'INSERT',$3,$4)`,
          [req.usuario.id, ins.rows[0].id, JSON.stringify(datos), req.ip]
        );
        return ins.rows[0];
      });
      logger.info('Cliente creado', { codigo: result.codigo, por: req.usuario.email });
      return res.status(201).json({ ok: true, datos: result });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Codigo o RFC ya existe' });
      logger.error('Error creando cliente:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  actualizar: async (req, res) => {
    try {
      const { id } = req.params;
      const datos = req.body;
      const anterior = await query('SELECT * FROM clientes WHERE id = $1', [id]);
      if (!anterior.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });

      await withTransaction(async (client) => {
        await client.query(`
          UPDATE clientes SET
            nombre=$1,rfc=$2,tipo=$3,sector=$4,direccion=$5,ciudad=$6,estado=$7,
            pais=$8,telefono=$9,email=$10,contacto_nombre=$11,contacto_email=$12,
            contacto_tel=$13,moneda_preferida=$14,credito_limite=$15,credito_dias=$16,
            unidad_negocio_id=$17,notas=$18,activo=$19,actualizado_en=NOW()
          WHERE id=$20
        `, [
          datos.nombre, datos.rfc||null, datos.tipo||'Empresa', datos.sector||null,
          datos.direccion||null, datos.ciudad||null, datos.estado||null,
          datos.pais||'Mexico', datos.telefono||null, datos.email||null,
          datos.contacto_nombre||null, datos.contacto_email||null, datos.contacto_tel||null,
          datos.moneda_preferida||'MXN', datos.credito_limite||0, datos.credito_dias||30,
          datos.unidad_negocio_id||null, datos.notas||null,
          datos.activo !== undefined ? datos.activo : true, id
        ]);
        await client.query(
          `INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_anteriores,datos_nuevos,ip_address)
           VALUES ($1,'clientes',$2,'UPDATE',$3,$4,$5)`,
          [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(datos), req.ip]
        );
      });
      return res.json({ ok: true, message: 'Cliente actualizado' });
    } catch (err) {
      logger.error('Error actualizando cliente:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  desactivar: async (req, res) => {
    try {
      await query('UPDATE clientes SET activo=false,actualizado_en=NOW() WHERE id=$1', [req.params.id]);
      await query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,ip_address)
                   VALUES ($1,'clientes',$2,'DESACTIVAR',$3)`,
                   [req.usuario.id, req.params.id, req.ip]);
      return res.json({ ok: true, message: 'Cliente desactivado' });
    } catch (err) {
      logger.error('Error desactivando cliente:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════
// PROVEEDORES
// ════════════════════════════════════════════════════════════
const proveedores = {

  listar: async (req, res) => {
    try {
      const { search, activo = 'true', moneda, page = 1, limit = 50 } = req.query;
      const params = [];
      let idx = 1;
      let where = 'WHERE 1=1';

      if (activo !== 'all') { where += ` AND p.activo = $${idx++}`; params.push(activo === 'true'); }
      if (moneda)           { where += ` AND p.moneda_preferida = $${idx++}`; params.push(moneda); }
      if (search) {
        where += ` AND (p.nombre ILIKE $${idx} OR p.rfc ILIKE $${idx} OR p.giro ILIKE $${idx} OR p.codigo ILIKE $${idx})`;
        params.push(`%${search}%`); idx++;
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const countRes = await query(`SELECT COUNT(*) FROM proveedores p ${where}`, params);
      const dataRes  = await query(`
        SELECT p.*, u.nombre as creado_por_nombre
        FROM proveedores p
        LEFT JOIN usuarios u ON p.creado_por = u.id
        ${where} ORDER BY p.nombre
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, parseInt(limit), offset]);

      return res.json({ ok: true, total: parseInt(countRes.rows[0].count), datos: dataRes.rows });
    } catch (err) {
      logger.error('Error listando proveedores:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  obtener: async (req, res) => {
    try {
      const result = await query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
      return res.json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error obteniendo proveedor:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crear: async (req, res) => {
    try {
      const datos = req.body;
      const result = await withTransaction(async (client) => {
        if (!datos.codigo) datos.codigo = await generarCodigo(client, 'PRV', 'proveedores');
        const ins = await client.query(`
          INSERT INTO proveedores
            (codigo,nombre,rfc,tipo,giro,direccion,ciudad,estado,pais,
             telefono,email,contacto_nombre,contacto_email,contacto_tel,
             moneda_preferida,dias_credito,wallet_cripto,banco,clabe_proveedor,notas,creado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          RETURNING id, codigo, nombre
        `, [
          datos.codigo, datos.nombre, datos.rfc||null, datos.tipo||'Empresa',
          datos.giro||null, datos.direccion||null, datos.ciudad||null,
          datos.estado||null, datos.pais||'Mexico', datos.telefono||null,
          datos.email||null, datos.contacto_nombre||null, datos.contacto_email||null,
          datos.contacto_tel||null, datos.moneda_preferida||'MXN',
          datos.dias_credito||30, datos.wallet_cripto||null,
          datos.banco||null, datos.clabe_proveedor||null, datos.notas||null, req.usuario.id
        ]);
        await client.query(
          `INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
           VALUES ($1,'proveedores',$2,'INSERT',$3,$4)`,
          [req.usuario.id, ins.rows[0].id, JSON.stringify(datos), req.ip]
        );
        return ins.rows[0];
      });
      return res.status(201).json({ ok: true, datos: result });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Codigo ya existe' });
      logger.error('Error creando proveedor:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  actualizar: async (req, res) => {
    try {
      const { id } = req.params;
      const datos = req.body;
      await withTransaction(async (client) => {
        const ant = await client.query('SELECT * FROM proveedores WHERE id=$1', [id]);
        if (!ant.rows.length) throw { status: 404, message: 'Proveedor no encontrado' };
        await client.query(`
          UPDATE proveedores SET
            nombre=$1,rfc=$2,tipo=$3,giro=$4,direccion=$5,ciudad=$6,estado=$7,
            pais=$8,telefono=$9,email=$10,contacto_nombre=$11,contacto_email=$12,
            contacto_tel=$13,moneda_preferida=$14,dias_credito=$15,
            wallet_cripto=$16,banco=$17,clabe_proveedor=$18,notas=$19,activo=$20,
            actualizado_en=NOW()
          WHERE id=$21
        `, [
          datos.nombre,datos.rfc||null,datos.tipo||'Empresa',datos.giro||null,
          datos.direccion||null,datos.ciudad||null,datos.estado||null,datos.pais||'Mexico',
          datos.telefono||null,datos.email||null,datos.contacto_nombre||null,
          datos.contacto_email||null,datos.contacto_tel||null,datos.moneda_preferida||'MXN',
          datos.dias_credito||30,datos.wallet_cripto||null,datos.banco||null,
          datos.clabe_proveedor||null,datos.notas||null,
          datos.activo !== undefined ? datos.activo : true, id
        ]);
        await client.query(
          `INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_anteriores,datos_nuevos,ip_address)
           VALUES ($1,'proveedores',$2,'UPDATE',$3,$4,$5)`,
          [req.usuario.id, id, JSON.stringify(ant.rows[0]), JSON.stringify(datos), req.ip]
        );
      });
      return res.json({ ok: true, message: 'Proveedor actualizado' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error('Error actualizando proveedor:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  desactivar: async (req, res) => {
    try {
      await query('UPDATE proveedores SET activo=false,actualizado_en=NOW() WHERE id=$1', [req.params.id]);
      return res.json({ ok: true, message: 'Proveedor desactivado' });
    } catch (err) {
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════
// PRODUCTOS Y SERVICIOS
// ════════════════════════════════════════════════════════════
const productos = {

  listar: async (req, res) => {
    try {
      const { search, tipo, activo = 'true', rst, page = 1, limit = 50 } = req.query;
      const params = [];
      let idx = 1;
      let where = 'WHERE 1=1';

      if (activo !== 'all') { where += ` AND p.activo = $${idx++}`; params.push(activo === 'true'); }
      if (tipo)             { where += ` AND p.tipo = $${idx++}`; params.push(tipo); }
      if (rst === 'true')   { where += ` AND p.es_producto_rst = true`; }
      if (search) {
        where += ` AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.descripcion ILIKE $${idx})`;
        params.push(`%${search}%`); idx++;
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const countRes = await query(`SELECT COUNT(*) FROM productos_servicios p ${where}`, params);
      const dataRes  = await query(`
        SELECT p.*, cat.nombre as categoria_nombre
        FROM productos_servicios p
        LEFT JOIN categorias_producto cat ON p.categoria_id = cat.id
        ${where} ORDER BY p.tipo, p.nombre
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, parseInt(limit), offset]);

      return res.json({ ok: true, total: parseInt(countRes.rows[0].count), datos: dataRes.rows });
    } catch (err) {
      logger.error('Error listando productos:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  obtener: async (req, res) => {
    try {
      const result = await query(`
        SELECT p.*, cat.nombre as categoria_nombre
        FROM productos_servicios p
        LEFT JOIN categorias_producto cat ON p.categoria_id = cat.id
        WHERE p.id = $1
      `, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
      return res.json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error obteniendo producto:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crear: async (req, res) => {
    try {
      const d = req.body;
      const result = await withTransaction(async (client) => {
        if (!d.codigo) {
          const prefix = d.tipo === 'Servicio' ? 'SRV' : d.es_producto_rst ? 'RST' : 'SUM';
          d.codigo = await generarCodigo(client, prefix, 'productos_servicios');
        }
        const ins = await client.query(`
          INSERT INTO productos_servicios
            (codigo,nombre,descripcion,tipo,categoria_id,unidad_medida,
             precio_venta_mxn,precio_venta_usd,costo_mxn,costo_usd,
             aplica_iva,tasa_iva,controla_inventario,stock_minimo,es_producto_rst,creado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          RETURNING id, codigo, nombre
        `, [
          d.codigo,d.nombre,d.descripcion||null,d.tipo,d.categoria_id||null,
          d.unidad_medida||null,d.precio_venta_mxn||null,d.precio_venta_usd||null,
          d.costo_mxn||null,d.costo_usd||null,d.aplica_iva!==false,
          d.tasa_iva||16,d.controla_inventario||false,d.stock_minimo||0,
          d.es_producto_rst||false,req.usuario.id
        ]);
        await client.query(
          `INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address)
           VALUES ($1,'productos_servicios',$2,'INSERT',$3,$4)`,
          [req.usuario.id, ins.rows[0].id, JSON.stringify(d), req.ip]
        );
        return ins.rows[0];
      });
      return res.status(201).json({ ok: true, datos: result });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Codigo ya existe' });
      logger.error('Error creando producto:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  actualizar: async (req, res) => {
    try {
      const { id } = req.params;
      const d = req.body;
      await query(`
        UPDATE productos_servicios SET
          nombre=$1,descripcion=$2,tipo=$3,categoria_id=$4,unidad_medida=$5,
          precio_venta_mxn=$6,precio_venta_usd=$7,costo_mxn=$8,costo_usd=$9,
          aplica_iva=$10,tasa_iva=$11,controla_inventario=$12,stock_minimo=$13,
          es_producto_rst=$14,activo=$15
        WHERE id=$16
      `, [
        d.nombre,d.descripcion||null,d.tipo,d.categoria_id||null,d.unidad_medida||null,
        d.precio_venta_mxn||null,d.precio_venta_usd||null,d.costo_mxn||null,d.costo_usd||null,
        d.aplica_iva!==false,d.tasa_iva||16,d.controla_inventario||false,d.stock_minimo||0,
        d.es_producto_rst||false,d.activo!==false,id
      ]);
      return res.json({ ok: true, message: 'Producto actualizado' });
    } catch (err) {
      logger.error('Error actualizando producto:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════
// TIPOS DE CAMBIO
// ════════════════════════════════════════════════════════════
const tiposCambio = {

  hoy: async (req, res) => {
    try {
      const result = await query(`
        SELECT * FROM tipos_cambio
        WHERE fecha = (SELECT MAX(fecha) FROM tipos_cambio)
        ORDER BY moneda
      `);
      return res.json({ ok: true, fecha: result.rows[0]?.fecha, datos: result.rows });
    } catch (err) {
      logger.error('Error obteniendo TC:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  historico: async (req, res) => {
    try {
      const { desde, hasta, moneda } = req.query;
      let where = 'WHERE 1=1';
      const params = [];
      let idx = 1;
      if (desde)  { where += ` AND fecha >= $${idx++}`; params.push(desde); }
      if (hasta)  { where += ` AND fecha <= $${idx++}`; params.push(hasta); }
      if (moneda) { where += ` AND moneda = $${idx++}`; params.push(moneda); }

      const result = await query(
        `SELECT * FROM tipos_cambio ${where} ORDER BY fecha DESC, moneda LIMIT 200`,
        params
      );
      return res.json({ ok: true, datos: result.rows });
    } catch (err) {
      logger.error('Error en historico TC:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  registrar: async (req, res) => {
    try {
      const { fecha, moneda, a_mxn, a_usd, fuente } = req.body;
      const result = await query(`
        INSERT INTO tipos_cambio (fecha, moneda, a_mxn, a_usd, fuente, registrado_por)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (fecha, moneda) DO UPDATE
          SET a_mxn=$3, a_usd=$4, fuente=$5, registrado_por=$6
        RETURNING *
      `, [fecha, moneda, a_mxn, a_usd||null, fuente||'Manual', req.usuario.id]);
      return res.json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error registrando TC:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  // Convierte un monto de cualquier moneda a MXN
  convertir: async (req, res) => {
    try {
      const { monto, de, fecha } = req.query;
      if (de === 'MXN') return res.json({ ok: true, mxn: parseFloat(monto), tc: 1 });

      const tcRes = await query(`
        SELECT a_mxn FROM tipos_cambio
        WHERE moneda = $1 AND fecha <= $2
        ORDER BY fecha DESC LIMIT 1
      `, [de, fecha || new Date().toISOString().split('T')[0]]);

      if (!tcRes.rows.length) {
        return res.status(404).json({ error: `Sin tipo de cambio para ${de}` });
      }
      const tc = parseFloat(tcRes.rows[0].a_mxn);
      return res.json({ ok: true, mxn: parseFloat(monto) * tc, tc, moneda: de });
    } catch (err) {
      logger.error('Error convirtiendo:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════
// CUENTAS BANCARIAS Y CARTERAS CRIPTO
// ════════════════════════════════════════════════════════════
const financiero = {

  listarCuentas: async (req, res) => {
    try {
      const result = await query(`
        SELECT cb.*, un.codigo as unidad_codigo
        FROM cuentas_bancarias cb
        LEFT JOIN unidades_negocio un ON cb.unidad_negocio_id = un.id
        WHERE cb.activo = true ORDER BY cb.moneda, cb.banco
      `);
      return res.json({ ok: true, datos: result.rows });
    } catch (err) {
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crearCuenta: async (req, res) => {
    try {
      const d = req.body;
      const result = await query(`
        INSERT INTO cuentas_bancarias
          (banco,nombre_cuenta,numero_cuenta,clabe,moneda,saldo_inicial,saldo_actual,unidad_negocio_id,notas)
        VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)
        RETURNING *
      `, [d.banco,d.nombre_cuenta,d.numero_cuenta||null,d.clabe||null,
          d.moneda||'MXN',d.saldo_inicial||0,d.unidad_negocio_id||null,d.notas||null]);
      return res.status(201).json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error creando cuenta:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  listarCarteras: async (req, res) => {
    try {
      const result = await query(`
        SELECT cc.*, un.codigo as unidad_codigo
        FROM carteras_cripto cc
        LEFT JOIN unidades_negocio un ON cc.unidad_negocio_id = un.id
        WHERE cc.activo = true ORDER BY cc.moneda
      `);
      return res.json({ ok: true, datos: result.rows });
    } catch (err) {
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crearCartera: async (req, res) => {
    try {
      const d = req.body;
      const result = await query(`
        INSERT INTO carteras_cripto
          (nombre,moneda,direccion_wallet,red,saldo_inicial,saldo_actual,unidad_negocio_id,notas)
        VALUES ($1,$2,$3,$4,$5,$5,$6,$7)
        RETURNING *
      `, [d.nombre,d.moneda,d.direccion_wallet||null,d.red||null,
          d.saldo_inicial||0,d.unidad_negocio_id||null,d.notas||null]);
      return res.status(201).json({ ok: true, datos: result.rows[0] });
    } catch (err) {
      logger.error('Error creando cartera:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  resumenFinanciero: async (req, res) => {
    try {
      const cuentas  = await query('SELECT moneda, SUM(saldo_actual) as total FROM cuentas_bancarias WHERE activo=true GROUP BY moneda');
      const carteras = await query('SELECT moneda, SUM(saldo_actual) as total FROM carteras_cripto WHERE activo=true GROUP BY moneda');
      const tcHoy    = await query('SELECT moneda, a_mxn FROM tipos_cambio WHERE fecha=(SELECT MAX(fecha) FROM tipos_cambio)');

      const tcMap = {};
      tcHoy.rows.forEach(t => tcMap[t.moneda] = parseFloat(t.a_mxn));

      let totalMXN = 0;
      const desglose = [];

      cuentas.rows.forEach(c => {
        const monto = parseFloat(c.total);
        const tc    = c.moneda === 'MXN' ? 1 : (tcMap[c.moneda] || 0);
        const mxn   = monto * tc;
        totalMXN += mxn;
        desglose.push({ tipo:'banco', moneda: c.moneda, monto, mxn });
      });

      carteras.rows.forEach(c => {
        const monto = parseFloat(c.total);
        const tc    = tcMap[c.moneda] || 0;
        const mxn   = monto * tc;
        totalMXN += mxn;
        desglose.push({ tipo:'cripto', moneda: c.moneda, monto, mxn });
      });

      return res.json({ ok: true, totalMXN, desglose });
    } catch (err) {
      logger.error('Error en resumen financiero:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

// ════════════════════════════════════════════════════════════
// CATEGORÍAS Y FAMILIAS
// ════════════════════════════════════════════════════════════
const catalogosAux = {
  categorias: async (req, res) => {
    const result = await query('SELECT * FROM categorias_producto WHERE activo=true ORDER BY tipo,nombre');
    return res.json({ ok: true, datos: result.rows });
  },
  familias: async (req, res) => {
    const result = await query('SELECT * FROM familias_presupuesto_catalogo WHERE activo=true ORDER BY orden');
    return res.json({ ok: true, datos: result.rows });
  },
};

module.exports = { clientes, proveedores, productos, tiposCambio, financiero, catalogosAux };
