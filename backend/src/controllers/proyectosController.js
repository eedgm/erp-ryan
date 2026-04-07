const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

// ── Genera folio automático ───────────────────────────────────
// Formato: CI-2026-001
const generarFolio = async (client, unidadCodigo) => {
  const anio = new Date().getFullYear();
  const res = await client.query(`
    SELECT COUNT(*) as total FROM proyectos p
    JOIN unidades_negocio u ON p.unidad_negocio_id = u.id
    WHERE u.codigo = $1 AND EXTRACT(YEAR FROM p.creado_en) = $2
  `, [unidadCodigo, anio]);
  const num = String(parseInt(res.rows[0].total) + 1).padStart(3, '0');
  return `${unidadCodigo}-${anio}-${num}`;
};

// ── Helper: query de proyecto completo ────────────────────────
const queryProyectoCompleto = `
  SELECT
    p.*,
    c.nombre              AS cliente_nombre,
    c.rfc                 AS cliente_rfc,
    c.contacto_nombre     AS cliente_contacto,
    un.codigo             AS unidad_codigo,
    un.nombre             AS unidad_nombre,
    u.nombre || ' ' || COALESCE(u.apellidos,'') AS responsable_nombre,
    cr.nombre || ' ' || COALESCE(cr.apellidos,'') AS creado_por_nombre,
    -- Totales financieros (se calculan desde ingresos y gastos)
    COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id), 0) AS total_ingresos_mxn,
    COALESCE((SELECT SUM(g.total_mxn) FROM gastos  g WHERE g.proyecto_id = p.id), 0) AS total_gastos_mxn,
    COALESCE((SELECT SUM(g.total_mxn) FROM gastos  g WHERE g.proyecto_id = p.id AND g.estado_pago = 'Pendiente'), 0) AS gastos_pendientes_mxn,
    COALESCE((SELECT SUM(i.total_mxn) FROM ingresos i WHERE i.proyecto_id = p.id AND i.estado_cobro != 'Cobrado'), 0) AS por_cobrar_mxn,
    -- Presupuesto total consumido
    COALESCE((SELECT SUM(ppf.consumido) FROM proyecto_presupuesto_familias ppf WHERE ppf.proyecto_id = p.id), 0) AS presupuesto_consumido,
    -- % consumido del presupuesto global (en MXN)
    CASE WHEN p.presupuesto_global_mxn > 0
      THEN ROUND(
        COALESCE((SELECT SUM(ppf.consumido) FROM proyecto_presupuesto_familias ppf WHERE ppf.proyecto_id = p.id),0)
        / p.presupuesto_global_mxn * 100, 1)
      ELSE 0
    END AS pct_presupuesto_consumido
  FROM proyectos p
  LEFT JOIN clientes          c  ON p.cliente_id         = c.id
  LEFT JOIN unidades_negocio  un ON p.unidad_negocio_id  = un.id
  LEFT JOIN usuarios          u  ON p.responsable_id     = u.id
  LEFT JOIN usuarios          cr ON p.creado_por         = cr.id
`;

// ════════════════════════════════════════════════════════════
// GET /api/proyectos
// ════════════════════════════════════════════════════════════
const listar = async (req, res) => {
  try {
    const { search, estado, unidad_id, cliente_id, responsable_id,
            moneda, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (estado)        { where += ` AND p.estado = $${idx++}`;                params.push(estado); }
    if (unidad_id)     { where += ` AND p.unidad_negocio_id = $${idx++}`;     params.push(unidad_id); }
    if (cliente_id)    { where += ` AND p.cliente_id = $${idx++}`;            params.push(cliente_id); }
    if (responsable_id){ where += ` AND p.responsable_id = $${idx++}`;        params.push(responsable_id); }
    if (moneda)        { where += ` AND p.moneda = $${idx++}`;                params.push(moneda); }
    if (search) {
      where += ` AND (p.folio ILIKE $${idx} OR p.nombre ILIKE $${idx} OR c.nombre ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    // Coordinadores solo ven su unidad
    if (req.unidadFiltro) {
      where += ` AND p.unidad_negocio_id = $${idx++}`;
      params.push(req.unidadFiltro);
    }

    const countSql = `SELECT COUNT(*) FROM proyectos p LEFT JOIN clientes c ON p.cliente_id=c.id ${where}`;
    const total = parseInt((await query(countSql, params)).rows[0].count);

    const sql = `${queryProyectoCompleto} ${where}
                 ORDER BY p.estado ASC, p.creado_en DESC
                 LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok: true, total, pagina: parseInt(page), datos: result.rows });

  } catch (err) {
    logger.error('Error listando proyectos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/proyectos/:id
// ════════════════════════════════════════════════════════════
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const proyRes = await query(`${queryProyectoCompleto} WHERE p.id = $1`, [id]);
    if (!proyRes.rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const proyecto = proyRes.rows[0];

    // Presupuesto por familias
    const famRes = await query(`
      SELECT ppf.*, fpc.nombre AS familia_catalogo_nombre,
        CASE WHEN ppf.presupuesto > 0
          THEN ROUND(ppf.consumido / ppf.presupuesto * 100, 1)
          ELSE 0
        END AS pct_consumido,
        ppf.presupuesto - ppf.consumido - ppf.reservado AS disponible
      FROM proyecto_presupuesto_familias ppf
      LEFT JOIN familias_presupuesto_catalogo fpc ON ppf.familia_id = fpc.id
      WHERE ppf.proyecto_id = $1
      ORDER BY ppf.id
    `, [id]);

    // Últimos movimientos (ingresos + gastos juntos)
    const movRes = await query(`
      (SELECT 'ingreso' AS tipo, i.fecha, i.folio_interno AS folio,
              i.concepto, i.total_mxn AS monto_mxn, i.estado_cobro AS estado
       FROM ingresos i WHERE i.proyecto_id = $1)
      UNION ALL
      (SELECT 'gasto' AS tipo, g.fecha, g.folio_interno AS folio,
              g.concepto, g.total_mxn AS monto_mxn, g.estado_pago AS estado
       FROM gastos g WHERE g.proyecto_id = $1)
      ORDER BY fecha DESC LIMIT 10
    `, [id]);

    // Log de estados
    const logRes = await query(`
      SELECT pel.*, u.nombre || ' ' || COALESCE(u.apellidos,'') AS usuario_nombre
      FROM proyecto_estados_log pel
      LEFT JOIN usuarios u ON pel.usuario_id = u.id
      WHERE pel.proyecto_id = $1 ORDER BY pel.creado_en DESC
    `, [id]);

    return res.json({
      ok: true,
      datos: {
        ...proyecto,
        familias:         famRes.rows,
        ultimos_movimientos: movRes.rows,
        estados_log:      logRes.rows,
      }
    });

  } catch (err) {
    logger.error('Error obteniendo proyecto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/proyectos
// ════════════════════════════════════════════════════════════
const crear = async (req, res) => {
  const { nombre, descripcion, cliente_id, unidad_negocio_id, tipo, moneda,
          tipo_cambio_inicial, presupuesto_global, fecha_inicio,
          fecha_fin_estimada, responsable_id, tiene_almacen,
          familias, notas } = req.body;

  // Validar que las familias sumen el presupuesto global
  if (familias && familias.length > 0) {
    const sumaFamilias = familias.reduce((acc, f) => acc + parseFloat(f.presupuesto || 0), 0);
    const diff = Math.abs(sumaFamilias - parseFloat(presupuesto_global));
    if (diff > 0.01) {
      return res.status(400).json({
        error: `La suma de familias ($${sumaFamilias.toFixed(2)}) no coincide con el presupuesto global ($${parseFloat(presupuesto_global).toFixed(2)})`
      });
    }
  }

  try {
    const resultado = await withTransaction(async (client) => {

      // Obtener codigo de unidad
      const unidadRes = await client.query(
        'SELECT codigo FROM unidades_negocio WHERE id = $1', [unidad_negocio_id]
      );
      if (!unidadRes.rows.length) throw new Error('Unidad de negocio no encontrada');
      const unidadCodigo = unidadRes.rows[0].codigo;

      const folio = await generarFolio(client, unidadCodigo);
      const tc = parseFloat(tipo_cambio_inicial || 1);
      const presupuestoMxn = parseFloat(presupuesto_global) * tc;

      // Insertar proyecto
      const proy = await client.query(`
        INSERT INTO proyectos
          (folio, nombre, descripcion, cliente_id, unidad_negocio_id,
           tipo, moneda, tipo_cambio_inicial, presupuesto_global,
           presupuesto_global_mxn, fecha_inicio, fecha_fin_estimada,
           responsable_id, tiene_almacen, notas, creado_por, actualizado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
        RETURNING id, folio
      `, [
        folio, nombre, descripcion || null, cliente_id || null,
        unidad_negocio_id, tipo || 'Proyecto', moneda || 'MXN', tc,
        presupuesto_global, presupuestoMxn, fecha_inicio || null,
        fecha_fin_estimada || null, responsable_id || null,
        tiene_almacen || false, notas || null, req.usuario.id
      ]);

      const proyId = proy.rows[0].id;
      const proyFolio = proy.rows[0].folio;

      // Insertar familias de presupuesto
      if (familias && familias.length > 0) {
        for (const f of familias) {
          await client.query(`
            INSERT INTO proyecto_presupuesto_familias
              (proyecto_id, familia_id, nombre_familia, presupuesto)
            VALUES ($1, $2, $3, $4)
          `, [proyId, f.familia_id || null, f.nombre_familia, parseFloat(f.presupuesto)]);
        }
      }

      // Crear almacén propio si se solicitó
      if (tiene_almacen) {
        const almRes = await client.query(`
          INSERT INTO almacenes (clave, nombre, tipo, moneda_valuacion, proyecto_id, creado_por)
          VALUES ($1, $2, 'folio', $3, $4, $5)
          RETURNING id
        `, [
          `ALM-${proyFolio}`,
          `Almacén ${proyFolio}`,
          moneda || 'MXN',
          proyId,
          req.usuario.id
        ]);
        // Actualizar referencia al almacén en el proyecto
        await client.query(
          'UPDATE proyectos SET almacen_id = $1 WHERE id = $2',
          [almRes.rows[0].id, proyId]
        );
      }

      // Log de creación
      await client.query(`
        INSERT INTO proyecto_estados_log (proyecto_id, estado_nuevo, motivo, usuario_id)
        VALUES ($1, 'Activo', 'Proyecto creado', $2)
      `, [proyId, req.usuario.id]);

      // Bitácora
      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1, 'proyectos', $2, 'INSERT', $3, $4)
      `, [req.usuario.id, proyId, JSON.stringify({ folio: proyFolio, nombre }), req.ip]);

      return { id: proyId, folio: proyFolio };
    });

    logger.info('Proyecto creado', { folio: resultado.folio, por: req.usuario.email });
    return res.status(201).json({
      ok: true,
      message: `Proyecto ${resultado.folio} creado correctamente`,
      datos: resultado
    });

  } catch (err) {
    if (err.message.includes('suma de familias')) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('Error creando proyecto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PUT /api/proyectos/:id
// ════════════════════════════════════════════════════════════
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, cliente_id, tipo, fecha_inicio,
          fecha_fin_estimada, responsable_id, avance_porcentaje,
          notas, familias } = req.body;

  try {
    const anterior = await query('SELECT * FROM proyectos WHERE id = $1', [id]);
    if (!anterior.rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // Si cambian familias, re-validar suma
    if (familias) {
      const proyActual = anterior.rows[0];
      const sumaFamilias = familias.reduce((acc, f) => acc + parseFloat(f.presupuesto || 0), 0);
      const diff = Math.abs(sumaFamilias - parseFloat(proyActual.presupuesto_global));
      if (diff > 0.01) {
        return res.status(400).json({
          error: `La suma de familias ($${sumaFamilias.toFixed(2)}) no coincide con el presupuesto global ($${proyActual.presupuesto_global})`
        });
      }
    }

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE proyectos SET
          nombre              = COALESCE($1, nombre),
          descripcion         = COALESCE($2, descripcion),
          cliente_id          = COALESCE($3, cliente_id),
          tipo                = COALESCE($4, tipo),
          fecha_inicio        = COALESCE($5, fecha_inicio),
          fecha_fin_estimada  = COALESCE($6, fecha_fin_estimada),
          responsable_id      = COALESCE($7, responsable_id),
          avance_porcentaje   = COALESCE($8, avance_porcentaje),
          notas               = COALESCE($9, notas),
          actualizado_en      = NOW(),
          actualizado_por     = $10
        WHERE id = $11
      `, [nombre, descripcion, cliente_id, tipo, fecha_inicio,
          fecha_fin_estimada, responsable_id, avance_porcentaje,
          notas, req.usuario.id, id]);

      // Actualizar familias si se envían
      if (familias && familias.length > 0) {
        for (const f of familias) {
          await client.query(`
            UPDATE proyecto_presupuesto_familias
            SET presupuesto = $1
            WHERE proyecto_id = $2 AND familia_id = $3
          `, [parseFloat(f.presupuesto), id, f.familia_id]);
        }
      }

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos, ip_address)
        VALUES ($1,'proyectos',$2,'UPDATE',$3,$4,$5)
      `, [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(req.body), req.ip]);
    });

    return res.json({ ok: true, message: 'Proyecto actualizado correctamente' });

  } catch (err) {
    logger.error('Error actualizando proyecto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/proyectos/:id/estado
// ════════════════════════════════════════════════════════════
const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, motivo } = req.body;

  const estadosValidos = ['Activo','Pausado','Cerrado','Cancelado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }

  try {
    const anterior = await query('SELECT estado FROM proyectos WHERE id = $1', [id]);
    if (!anterior.rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const estadoAntes = anterior.rows[0].estado;
    if (estadoAntes === estado) {
      return res.status(400).json({ error: `El proyecto ya está en estado: ${estado}` });
    }

    await withTransaction(async (client) => {
      const cerradoEn = (estado === 'Cerrado' || estado === 'Cancelado') ? 'NOW()' : 'NULL';
      const cerradoPor = (estado === 'Cerrado' || estado === 'Cancelado') ? req.usuario.id : null;

      await client.query(`
        UPDATE proyectos SET estado = $1, cerrado_en = ${cerradoEn},
          cerrado_por = $2, actualizado_en = NOW(), actualizado_por = $3
        WHERE id = $4
      `, [estado, cerradoPor, req.usuario.id, id]);

      await client.query(`
        INSERT INTO proyecto_estados_log (proyecto_id, estado_antes, estado_nuevo, motivo, usuario_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, estadoAntes, estado, motivo || null, req.usuario.id]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1,'proyectos',$2,'CAMBIO_ESTADO',$3,$4)
      `, [req.usuario.id, id, JSON.stringify({ estado_antes: estadoAntes, estado_nuevo: estado, motivo }), req.ip]);
    });

    logger.info('Estado de proyecto cambiado', { id, de: estadoAntes, a: estado });
    return res.json({ ok: true, message: `Proyecto cambiado a: ${estado}` });

  } catch (err) {
    logger.error('Error cambiando estado de proyecto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/proyectos/:id/presupuesto
// Detalle del presupuesto por familias con semáforos
// ════════════════════════════════════════════════════════════
const presupuesto = async (req, res) => {
  try {
    const { id } = req.params;

    const proyRes = await query(
      'SELECT id, folio, nombre, presupuesto_global, presupuesto_global_mxn, moneda FROM proyectos WHERE id = $1',
      [id]
    );
    if (!proyRes.rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const famRes = await query(`
      SELECT ppf.*,
        fpc.nombre      AS familia_catalogo,
        ppf.presupuesto - ppf.consumido - ppf.reservado AS disponible,
        CASE WHEN ppf.presupuesto > 0
          THEN ROUND(ppf.consumido / ppf.presupuesto * 100, 1)
          ELSE 0 END AS pct_consumido,
        CASE
          WHEN ppf.presupuesto = 0 THEN 'sin_presupuesto'
          WHEN (ppf.consumido + ppf.reservado) >= ppf.presupuesto THEN 'excedido'
          WHEN (ppf.consumido + ppf.reservado) >= ppf.presupuesto * 0.90 THEN 'critico'
          WHEN (ppf.consumido + ppf.reservado) >= ppf.presupuesto * 0.75 THEN 'alerta'
          ELSE 'ok'
        END AS semaforo
      FROM proyecto_presupuesto_familias ppf
      LEFT JOIN familias_presupuesto_catalogo fpc ON ppf.familia_id = fpc.id
      WHERE ppf.proyecto_id = $1 ORDER BY ppf.id
    `, [id]);

    const totales = {
      presupuesto_total: famRes.rows.reduce((a, f) => a + parseFloat(f.presupuesto), 0),
      consumido_total:   famRes.rows.reduce((a, f) => a + parseFloat(f.consumido), 0),
      reservado_total:   famRes.rows.reduce((a, f) => a + parseFloat(f.reservado), 0),
      disponible_total:  famRes.rows.reduce((a, f) => a + parseFloat(f.disponible), 0),
    };
    totales.pct_consumido_global = totales.presupuesto_total > 0
      ? Math.round(totales.consumido_total / totales.presupuesto_total * 100 * 10) / 10
      : 0;

    return res.json({ ok: true, proyecto: proyRes.rows[0], familias: famRes.rows, totales });

  } catch (err) {
    logger.error('Error obteniendo presupuesto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/proyectos/dashboard
// KPIs resumidos para el dashboard
// ════════════════════════════════════════════════════════════
const dashboard = async (req, res) => {
  try {
    const unidadFiltro = req.unidadFiltro;
    let whereUnidad = unidadFiltro ? `AND p.unidad_negocio_id = ${unidadFiltro}` : '';

    const kpis = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'Activo')    AS activos,
        COUNT(*) FILTER (WHERE estado = 'Pausado')   AS pausados,
        COUNT(*) FILTER (WHERE estado = 'Cerrado')   AS cerrados,
        COUNT(*) FILTER (WHERE estado = 'Cancelado') AS cancelados,
        COUNT(*)                                      AS total,
        COALESCE(SUM(presupuesto_global_mxn) FILTER (WHERE estado = 'Activo'), 0) AS valor_activos_mxn
      FROM proyectos p WHERE 1=1 ${whereUnidad}
    `);

    // Proyectos con presupuesto en zona de alerta o excedido
    const alertas = await query(`
      SELECT p.id, p.folio, p.nombre, un.codigo AS unidad,
        SUM(ppf.consumido) AS consumido, p.presupuesto_global_mxn,
        ROUND(SUM(ppf.consumido) / NULLIF(p.presupuesto_global_mxn,0) * 100, 1) AS pct
      FROM proyectos p
      JOIN proyecto_presupuesto_familias ppf ON ppf.proyecto_id = p.id
      JOIN unidades_negocio un ON p.unidad_negocio_id = un.id
      WHERE p.estado = 'Activo' ${whereUnidad}
      GROUP BY p.id, p.folio, p.nombre, un.codigo, p.presupuesto_global_mxn
      HAVING ROUND(SUM(ppf.consumido) / NULLIF(p.presupuesto_global_mxn,0) * 100, 1) >= 75
      ORDER BY pct DESC LIMIT 5
    `);

    // Por unidad de negocio
    const porUnidad = await query(`
      SELECT un.codigo, un.nombre,
        COUNT(*) FILTER (WHERE p.estado = 'Activo') AS activos,
        COALESCE(SUM(p.presupuesto_global_mxn) FILTER (WHERE p.estado = 'Activo'), 0) AS valor_mxn
      FROM proyectos p
      JOIN unidades_negocio un ON p.unidad_negocio_id = un.id
      GROUP BY un.id, un.codigo, un.nombre ORDER BY un.codigo
    `);

    return res.json({
      ok: true,
      kpis: kpis.rows[0],
      alertas_presupuesto: alertas.rows,
      por_unidad: porUnidad.rows,
    });

  } catch (err) {
    logger.error('Error en dashboard proyectos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, presupuesto, dashboard };
