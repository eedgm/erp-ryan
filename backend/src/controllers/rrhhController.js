const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');
const { parse } = require('csv-parse/sync');

// ════════════════════════════════════════════════════════════
// EMPLEADOS
// ════════════════════════════════════════════════════════════

const listarEmpleados = async (req, res) => {
  try {
    const { activo, unidad_id, search, page=1, limit=30 } = req.query;
    const offset = (page-1)*limit;
    let sql = `
      SELECT e.*,
        un.codigo AS unidad_codigo, un.nombre AS unidad_nombre,
        d.nombre  AS departamento_nombre,
        u.email   AS usuario_email,
        c.salario_base, c.moneda_salario, c.periodicidad,
        c.bono_puntualidad, c.moneda_bono
      FROM empleados e
      LEFT JOIN unidades_negocio un ON e.unidad_negocio_id = un.id
      LEFT JOIN departamentos     d  ON e.departamento_id  = d.id
      LEFT JOIN usuarios          u  ON e.usuario_id       = u.id
      LEFT JOIN LATERAL (
        SELECT * FROM contratos_empleado WHERE empleado_id=e.id AND activo=true
        ORDER BY fecha_inicio DESC LIMIT 1
      ) c ON true
      WHERE 1=1
    `;
    const params = []; let idx = 1;
    if (activo !== undefined) { sql += ` AND e.activo = $${idx++}`; params.push(activo==='true'); }
    if (unidad_id)  { sql += ` AND e.unidad_negocio_id = $${idx++}`; params.push(unidad_id); }
    if (search) {
      sql += ` AND (e.nombre ILIKE $${idx} OR e.apellidos ILIKE $${idx} OR e.numero_empleado ILIKE $${idx} OR e.puesto ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (req.unidadFiltro) { sql += ` AND e.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }

    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);
    sql += ` ORDER BY e.unidad_negocio_id, e.nombre LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return res.json({ ok:true, total, datos: result.rows });
  } catch (err) {
    logger.error('Error listando empleados:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const [empRes, contratosRes, asistRes] = await Promise.all([
      query(`
        SELECT e.*, un.codigo AS unidad_codigo, u.email AS usuario_email
        FROM empleados e
        LEFT JOIN unidades_negocio un ON e.unidad_negocio_id=un.id
        LEFT JOIN usuarios u ON e.usuario_id=u.id
        WHERE e.id=$1
      `, [id]),
      query('SELECT * FROM contratos_empleado WHERE empleado_id=$1 ORDER BY fecha_inicio DESC', [id]),
      query(`
        SELECT * FROM asistencias
        WHERE empleado_id=$1 AND fecha >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY fecha DESC
      `, [id]),
    ]);
    if (!empRes.rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });

    // Estadísticas de asistencia del mes
    const stats = {
      dias_laborados: asistRes.rows.filter(a=>a.tipo_dia==='Laboral').length,
      dias_falta:     asistRes.rows.filter(a=>a.tipo_dia==='Falta').length,
      dias_tarde:     asistRes.rows.filter(a=>a.minutos_tarde>10).length,
      con_bono:       asistRes.rows.filter(a=>a.tiene_bono).length,
    };

    return res.json({ ok:true, datos: { ...empRes.rows[0], contratos: contratosRes.rows, asistencias_recientes: asistRes.rows, stats_mes: stats } });
  } catch (err) {
    logger.error('Error obteniendo empleado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crearEmpleado = async (req, res) => {
  const { nombre, apellidos, puesto, tipo_jornada, unidad_negocio_id,
          departamento_id, usuario_id, id_biometrico, fecha_ingreso,
          telefono, email_personal, curp, rfc, imss, notas,
          // Contrato inicial
          salario_base, moneda_salario, periodicidad, bono_puntualidad } = req.body;
  try {
    const resultado = await withTransaction(async (client) => {
      const numRes = await client.query("SELECT 'EMP-'||LPAD((COUNT(*)+1)::TEXT,4,'0') AS num FROM empleados");
      const numEmp = numRes.rows[0].num;

      const empRes = await client.query(`
        INSERT INTO empleados
          (numero_empleado, nombre, apellidos, puesto, tipo_jornada, unidad_negocio_id,
           departamento_id, usuario_id, id_biometrico, fecha_ingreso,
           telefono, email_personal, curp, rfc, imss, notas, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id, numero_empleado
      `, [numEmp, nombre, apellidos||null, puesto||null, tipo_jornada||'Tiempo Completo',
          unidad_negocio_id||null, departamento_id||null, usuario_id||null,
          id_biometrico||null, fecha_ingreso||null, telefono||null,
          email_personal||null, curp||null, rfc||null, imss||null, notas||null,
          req.usuario.id]);

      const empId = empRes.rows[0].id;

      if (salario_base) {
        await client.query(`
          INSERT INTO contratos_empleado
            (empleado_id, tipo_contrato, fecha_inicio, salario_base, moneda_salario,
             periodicidad, bono_puntualidad, moneda_bono, activo, creado_por)
          VALUES ($1,'Indefinido',$2,$3,$4,$5,$6,$4,true,$7)
        `, [empId, fecha_ingreso||new Date().toISOString().split('T')[0],
            salario_base, moneda_salario||'MXN', periodicidad||'Quincenal',
            bono_puntualidad||0, req.usuario.id]);
      }

      await client.query(`INSERT INTO bitacora (usuario_id,tabla,registro_id,accion,datos_nuevos,ip_address) VALUES ($1,'empleados',$2,'INSERT',$3,$4)`,
        [req.usuario.id, empId, JSON.stringify({nombre, puesto}), req.ip]);

      return empRes.rows[0];
    });
    return res.status(201).json({ ok:true, message:`Empleado ${resultado.numero_empleado} creado`, datos: resultado });
  } catch (err) {
    logger.error('Error creando empleado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarEmpleado = async (req, res) => {
  const { id } = req.params;
  const campos = ['nombre','apellidos','puesto','tipo_jornada','unidad_negocio_id',
                  'departamento_id','id_biometrico','telefono','email_personal','notas','activo'];
  try {
    const sets = campos.map((c,i)=>`${c}=$${i+1}`).join(',');
    const vals = campos.map(c=>req.body[c]??null);
    vals.push(id);
    await query(`UPDATE empleados SET ${sets} WHERE id=$${campos.length+1}`, vals);
    return res.json({ ok:true, message:'Empleado actualizado' });
  } catch (err) {
    logger.error('Error actualizando empleado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// ASISTENCIAS — IMPORTACIÓN CSV DEL CHECADOR
// ════════════════════════════════════════════════════════════

// POST /api/rrhh/asistencias/importar
// El CSV del ZKTeco tiene columnas: ID_Empleado, Fecha, Hora, Tipo (E=Entrada,S=Salida)
// El CSV de la App Móvil: id_biometrico, fecha, hora_entrada, hora_salida
const importarAsistencias = async (req, res) => {
  const { fuente, filas, hora_entrada_tolerancia=8, minutos_tolerancia=10 } = req.body;
  // filas = [{ id_biometrico, fecha, hora_entrada, hora_salida }]

  if (!filas?.length) return res.status(400).json({ error: 'No hay filas para importar' });

  try {
    const resultado = await withTransaction(async (client) => {
      // Registrar importación
      const impRes = await client.query(`
        INSERT INTO importaciones_checador (fuente, total_registros, periodo_desde, periodo_hasta, importado_por)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [
        fuente||'ZKTeco', filas.length,
        filas.reduce((min,f)=>f.fecha<min?f.fecha:min, filas[0].fecha),
        filas.reduce((max,f)=>f.fecha>max?f.fecha:max, filas[0].fecha),
        req.usuario.id
      ]);
      const impId = impRes.rows[0].id;

      const errores = [];
      let importados = 0;

      for (const fila of filas) {
        try {
          // Buscar empleado por id_biometrico
          const empRes = await client.query(
            'SELECT id FROM empleados WHERE id_biometrico=$1 AND activo=true',
            [String(fila.id_biometrico).trim()]
          );
          if (!empRes.rows.length) {
            errores.push({ fila: fila.id_biometrico, error: `ID biométrico no encontrado: ${fila.id_biometrico}` });
            continue;
          }
          const empId = empRes.rows[0].id;

          // Calcular minutos tarde
          let minTarde = 0;
          if (fila.hora_entrada) {
            const [hE, mE] = fila.hora_entrada.split(':').map(Number);
            const minutosEntrada = hE * 60 + mE;
            const minutosEsperado = hora_entrada_tolerancia * 60;
            minTarde = Math.max(0, minutosEntrada - minutosEsperado - minutos_tolerancia);
          }

          // Calcular minutos laborados
          let minLaborados = 0;
          if (fila.hora_entrada && fila.hora_salida) {
            const [hE, mE] = fila.hora_entrada.split(':').map(Number);
            const [hS, mS] = fila.hora_salida.split(':').map(Number);
            minLaborados = Math.max(0, (hS*60+mS) - (hE*60+mE));
          }

          const tieneBono = minTarde === 0;

          await client.query(`
            INSERT INTO asistencias
              (empleado_id, fecha, hora_entrada, hora_salida, minutos_laborados,
               tipo_dia, minutos_tarde, tiene_bono, fuente, importacion_id)
            VALUES ($1,$2,$3,$4,$5,'Laboral',$6,$7,$8,$9)
            ON CONFLICT (empleado_id, fecha) DO UPDATE SET
              hora_entrada     = EXCLUDED.hora_entrada,
              hora_salida      = EXCLUDED.hora_salida,
              minutos_laborados= EXCLUDED.minutos_laborados,
              minutos_tarde    = EXCLUDED.minutos_tarde,
              tiene_bono       = EXCLUDED.tiene_bono,
              fuente           = EXCLUDED.fuente
          `, [empId, fila.fecha, fila.hora_entrada||null, fila.hora_salida||null,
              minLaborados, minTarde, tieneBono, fuente||'ZKTeco', impId]);

          importados++;
        } catch (rowErr) {
          errores.push({ fila: fila.id_biometrico, error: rowErr.message });
        }
      }

      await client.query(`
        UPDATE importaciones_checador SET importados=$1, errores=$2, detalle_errores=$3 WHERE id=$4
      `, [importados, errores.length, JSON.stringify(errores), impId]);

      return { importados, errores: errores.length, detalles_error: errores };
    });

    logger.info('Asistencias importadas', { fuente, importados: resultado.importados });
    return res.json({
      ok: true,
      message: `${resultado.importados} registros importados, ${resultado.errores} errores`,
      datos: resultado
    });
  } catch (err) {
    logger.error('Error importando asistencias:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/rrhh/asistencias  — reporte de asistencias del periodo
const reporteAsistencias = async (req, res) => {
  try {
    const { empleado_id, desde, hasta, unidad_id } = req.query;
    const unidadFiltro = unidad_id || req.unidadFiltro;

    let sql = `
      SELECT a.*,
        e.nombre || ' ' || COALESCE(e.apellidos,'') AS empleado_nombre,
        e.numero_empleado, e.puesto,
        un.codigo AS unidad_codigo
      FROM asistencias a
      JOIN empleados e ON a.empleado_id = e.id
      LEFT JOIN unidades_negocio un ON e.unidad_negocio_id = un.id
      WHERE 1=1
    `;
    const params = []; let idx = 1;
    if (empleado_id)  { sql += ` AND a.empleado_id = $${idx++}`;       params.push(empleado_id); }
    if (desde)        { sql += ` AND a.fecha >= $${idx++}`;            params.push(desde); }
    if (hasta)        { sql += ` AND a.fecha <= $${idx++}`;            params.push(hasta); }
    if (unidadFiltro) { sql += ` AND e.unidad_negocio_id = $${idx++}`;params.push(unidadFiltro); }
    sql += ' ORDER BY a.fecha DESC, e.nombre LIMIT 500';

    const result = await query(sql, params);
    return res.json({ ok:true, total: result.rowCount, datos: result.rows });
  } catch (err) {
    logger.error('Error en reporte asistencias:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ════════════════════════════════════════════════════════════
// NÓMINA
// ════════════════════════════════════════════════════════════

const listarPeriodosNomina = async (req, res) => {
  try {
    const { estado, unidad_id, page=1, limit=20 } = req.query;
    const offset = (page-1)*limit;
    let sql = `
      SELECT pn.*,
        un.codigo AS unidad_codigo,
        u.nombre  AS creado_por_nombre,
        au.nombre AS autorizado_por_nombre,
        (SELECT COUNT(*) FROM nomina_lineas nl WHERE nl.periodo_nomina_id=pn.id) AS total_empleados
      FROM periodos_nomina pn
      LEFT JOIN unidades_negocio un ON pn.unidad_negocio_id=un.id
      LEFT JOIN usuarios u  ON pn.creado_por=u.id
      LEFT JOIN usuarios au ON pn.autorizado_por=au.id
      WHERE 1=1
    `;
    const params = []; let idx=1;
    if (estado)    { sql += ` AND pn.estado = $${idx++}`;              params.push(estado); }
    if (unidad_id) { sql += ` AND pn.unidad_negocio_id = $${idx++}`;  params.push(unidad_id); }
    if (req.unidadFiltro) { sql += ` AND pn.unidad_negocio_id = $${idx++}`; params.push(req.unidadFiltro); }
    const total = parseInt((await query(`SELECT COUNT(*) FROM (${sql}) t`, params)).rows[0].count);
    sql += ` ORDER BY pn.fecha_inicio DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await query(sql, params);
    return res.json({ ok:true, total, datos: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const crearPeriodoNomina = async (req, res) => {
  const { nombre, periodicidad, fecha_inicio, fecha_fin, fecha_pago, unidad_negocio_id, notas } = req.body;
  try {
    const r = await query(`
      INSERT INTO periodos_nomina
        (nombre, periodicidad, fecha_inicio, fecha_fin, fecha_pago, unidad_negocio_id, notas, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nombre
    `, [nombre, periodicidad, fecha_inicio, fecha_fin, fecha_pago||null, unidad_negocio_id||null, notas||null, req.usuario.id]);
    return res.status(201).json({ ok:true, datos: r.rows[0] });
  } catch (err) {
    logger.error('Error creando periodo nomina:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const calcularNomina = async (req, res) => {
  const { id } = req.params;
  try {
    await query('SELECT calcular_nomina_periodo($1)', [id]);
    const periodo = await query('SELECT * FROM periodos_nomina WHERE id=$1', [id]);
    logger.info('Nómina calculada', { periodo_id: id });
    return res.json({ ok:true, message:'Nómina calculada correctamente', datos: periodo.rows[0] });
  } catch (err) {
    logger.error('Error calculando nómina:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
};

const obtenerNomina = async (req, res) => {
  try {
    const { id } = req.params;
    const [periodoRes, lineasRes] = await Promise.all([
      query(`
        SELECT pn.*, un.codigo AS unidad_codigo
        FROM periodos_nomina pn LEFT JOIN unidades_negocio un ON pn.unidad_negocio_id=un.id WHERE pn.id=$1
      `, [id]),
      query(`
        SELECT nl.*,
          e.nombre || ' ' || COALESCE(e.apellidos,'') AS empleado_nombre,
          e.numero_empleado, e.puesto,
          un.codigo AS unidad_codigo,
          c.moneda_salario
        FROM nomina_lineas nl
        JOIN empleados e ON nl.empleado_id=e.id
        LEFT JOIN unidades_negocio un ON e.unidad_negocio_id=un.id
        LEFT JOIN contratos_empleado c ON nl.contrato_id=c.id
        WHERE nl.periodo_nomina_id=$1
        ORDER BY un.codigo, e.nombre
      `, [id]),
    ]);
    if (!periodoRes.rows.length) return res.status(404).json({ error: 'Periodo no encontrado' });
    return res.json({ ok:true, datos: { ...periodoRes.rows[0], lineas: lineasRes.rows } });
  } catch (err) {
    logger.error('Error obteniendo nómina:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const autorizarNomina = async (req, res) => {
  const { id } = req.params;
  try {
    const periodo = await query('SELECT estado FROM periodos_nomina WHERE id=$1', [id]);
    if (periodo.rows[0]?.estado !== 'Calculada') {
      return res.status(400).json({ error: 'La nómina debe estar Calculada para autorizarse' });
    }
    await query(`
      UPDATE periodos_nomina SET estado='Autorizada', autorizado_por=$1, autorizado_en=NOW()
      WHERE id=$2
    `, [req.usuario.id, id]);
    return res.json({ ok:true, message:'Nómina autorizada' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// PATCH /api/rrhh/nomina/:id/pagar-linea/:lineaId
// Registrar pago individual de una línea de nómina
const pagarLinea = async (req, res) => {
  const { id, lineaId } = req.params;
  const { fecha, forma_pago, cuenta_bancaria_id, cartera_cripto_id,
          tipo_cambio, referencia, hash_cripto, notas } = req.body;
  try {
    const lineaRes = await query('SELECT * FROM nomina_lineas WHERE id=$1', [lineaId]);
    if (!lineaRes.rows.length) return res.status(404).json({ error: 'Línea de nómina no encontrada' });
    const linea = lineaRes.rows[0];
    const tc = parseFloat(tipo_cambio||1);
    const montoMoneda = linea.neto_pagar / tc;

    await withTransaction(async (client) => {
      // Registrar pago
      await client.query(`
        INSERT INTO pagos_nomina
          (nomina_linea_id, periodo_nomina_id, empleado_id, fecha, monto_mxn,
           moneda_pago, monto_moneda, tipo_cambio, forma_pago,
           cuenta_bancaria_id, cartera_cripto_id, referencia, hash_cripto, notas, registrado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [lineaId, id, linea.empleado_id, fecha, linea.neto_pagar,
          forma_pago?.includes('U')||forma_pago==='BTC'||forma_pago==='ETH'?forma_pago:'MXN',
          montoMoneda, tc, forma_pago||'Transferencia',
          cuenta_bancaria_id||null, cartera_cripto_id||null,
          referencia||null, hash_cripto||null, notas||null, req.usuario.id]);

      // Marcar línea como pagada
      await client.query(`
        UPDATE nomina_lineas SET estado='Pagado', fecha_pago=$1, forma_pago=$2, hash_cripto=$3 WHERE id=$4
      `, [fecha, forma_pago||'Transferencia', hash_cripto||null, lineaId]);

      // Verificar si todas las líneas están pagadas
      const pendientes = await client.query(
        "SELECT COUNT(*) FROM nomina_lineas WHERE periodo_nomina_id=$1 AND estado='Pendiente'",
        [id]
      );
      if (parseInt(pendientes.rows[0].count) === 0) {
        await client.query(
          "UPDATE periodos_nomina SET estado='Pagada', pagado_en=NOW() WHERE id=$1", [id]
        );
      }
    });

    return res.json({ ok:true, message:'Pago registrado correctamente' });
  } catch (err) {
    logger.error('Error pagando línea de nómina:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/rrhh/nomina/:id/exportar — datos para recibo de nómina
const exportarNomina = async (req, res) => {
  try {
    const { id } = req.params;
    const periodoRes = await query('SELECT * FROM periodos_nomina WHERE id=$1', [id]);
    const lineasRes  = await query(`
      SELECT nl.*,
        e.nombre || ' ' || COALESCE(e.apellidos,'') AS empleado_nombre,
        e.numero_empleado, e.curp, e.rfc, e.imss,
        e.puesto, un.codigo AS unidad, un.nombre AS unidad_nombre
      FROM nomina_lineas nl
      JOIN empleados e ON nl.empleado_id=e.id
      LEFT JOIN unidades_negocio un ON e.unidad_negocio_id=un.id
      WHERE nl.periodo_nomina_id=$1
      ORDER BY un.codigo, e.nombre
    `, [id]);

    const periodo = periodoRes.rows[0];
    if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

    // Formato para CSV/Excel
    const datos = lineasRes.rows.map(l => ({
      'Num. Empleado':      l.numero_empleado,
      'Nombre':             l.empleado_nombre,
      'Puesto':             l.puesto,
      'Unidad':             l.unidad,
      'CURP':               l.curp||'',
      'RFC':                l.rfc||'',
      'IMSS':               l.imss||'',
      'Días Periodo':       l.dias_periodo,
      'Días Trabajados':    l.dias_trabajados,
      'Días Falta':         l.dias_falta,
      'Salario Base':       l.salario_base,
      'Bono Puntualidad':   l.bono_puntualidad,
      'Hrs Extra':          l.importe_horas_extra,
      'Total Percepciones': l.total_percepciones,
      'IMSS Empleado':      l.imss_empleado,
      'ISR':                l.isr,
      'Descuento Faltas':   l.faltas_descuento,
      'Total Deducciones':  l.total_deducciones,
      'Neto a Pagar':       l.neto_pagar,
      'Moneda Pago':        l.moneda_pago,
      'Estado Pago':        l.estado,
    }));

    return res.json({ ok:true, periodo, datos });
  } catch (err) {
    logger.error('Error exportando nómina:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listarEmpleados, obtenerEmpleado, crearEmpleado, actualizarEmpleado,
  importarAsistencias, reporteAsistencias,
  listarPeriodosNomina, crearPeriodoNomina, calcularNomina,
  obtenerNomina, autorizarNomina, pagarLinea, exportarNomina,
};
