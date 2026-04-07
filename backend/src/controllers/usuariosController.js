const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// ── GET /api/usuarios ─────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const { activo, rol_id, unidad_id, search } = req.query;

    let sql = `
      SELECT
        u.id, u.nombre, u.apellidos, u.email, u.puesto,
        u.nivel_jerarquico, u.activo, u.primer_login,
        u.ultimo_acceso, u.creado_en,
        r.id as rol_id, r.nombre as rol_nombre, r.nivel as rol_nivel,
        un.id as unidad_id, un.codigo as unidad_codigo, un.nombre as unidad_nombre,
        d.nombre as departamento,
        rep.nombre || ' ' || COALESCE(rep.apellidos,'') as reporta_a
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      LEFT JOIN unidades_negocio un ON u.unidad_negocio_id = un.id
      LEFT JOIN departamentos d ON u.departamento_id = d.id
      LEFT JOIN usuarios rep ON u.reporta_a_id = rep.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (activo !== undefined) {
      sql += ` AND u.activo = $${idx++}`;
      params.push(activo === 'true');
    }
    if (rol_id) { sql += ` AND u.rol_id = $${idx++}`; params.push(rol_id); }
    if (unidad_id) { sql += ` AND u.unidad_negocio_id = $${idx++}`; params.push(unidad_id); }
    if (search) {
      sql += ` AND (u.nombre ILIKE $${idx} OR u.apellidos ILIKE $${idx} OR u.email ILIKE $${idx} OR u.puesto ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    // Coordinadores solo ven usuarios de su unidad
    if (req.usuario.rol_nivel > 1 && req.usuario.unidad_id) {
      sql += ` AND u.unidad_negocio_id = $${idx++}`;
      params.push(req.usuario.unidad_id);
    }

    sql += ' ORDER BY r.nivel, u.nombre';

    const result = await query(sql, params);
    return res.json({ ok: true, total: result.rowCount, datos: result.rows });

  } catch (err) {
    logger.error('Error listando usuarios:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/usuarios/:id ─────────────────────────────────────
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT
        u.id, u.nombre, u.apellidos, u.email, u.puesto,
        u.nivel_jerarquico, u.activo, u.primer_login,
        u.ultimo_acceso, u.creado_en, u.actualizado_en,
        r.id as rol_id, r.nombre as rol_nombre, r.nivel as rol_nivel,
        un.id as unidad_id, un.codigo as unidad_codigo, un.nombre as unidad_nombre,
        d.id as dep_id, d.nombre as departamento,
        rep.id as reporta_id, rep.nombre || ' ' || COALESCE(rep.apellidos,'') as reporta_a
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      LEFT JOIN unidades_negocio un ON u.unidad_negocio_id = un.id
      LEFT JOIN departamentos d ON u.departamento_id = d.id
      LEFT JOIN usuarios rep ON u.reporta_a_id = rep.id
      WHERE u.id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.json({ ok: true, datos: result.rows[0] });

  } catch (err) {
    logger.error('Error obteniendo usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/usuarios ────────────────────────────────────────
const crear = async (req, res) => {
  const {
    nombre, apellidos, email, password,
    rol_id, unidad_negocio_id, departamento_id,
    puesto, reporta_a_id, nivel_jerarquico
  } = req.body;

  try {
    // Verificar email unico
    const existe = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (existe.rows.length) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    const passwordHash = await bcrypt.hash(password || 'Cambiar123!', BCRYPT_ROUNDS);

    const result = await withTransaction(async (client) => {
      const ins = await client.query(`
        INSERT INTO usuarios
          (nombre, apellidos, email, password_hash, rol_id, unidad_negocio_id,
           departamento_id, puesto, reporta_a_id, nivel_jerarquico)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, nombre, email
      `, [
        nombre, apellidos || '', email.toLowerCase().trim(),
        passwordHash, rol_id, unidad_negocio_id || null,
        departamento_id || null, puesto || '',
        reporta_a_id || null, nivel_jerarquico || 'Operativo'
      ]);

      // Bitacora
      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
        VALUES ($1, 'usuarios', $2, 'INSERT', $3, $4)
      `, [
        req.usuario.id,
        ins.rows[0].id,
        JSON.stringify({ nombre, email, rol_id }),
        req.ip
      ]);

      return ins.rows[0];
    });

    logger.info('Usuario creado', { nuevo: result.email, por: req.usuario.email });
    return res.status(201).json({
      ok: true,
      message: 'Usuario creado. Password inicial: Cambiar123!',
      datos: result
    });

  } catch (err) {
    logger.error('Error creando usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/usuarios/:id ─────────────────────────────────────
const actualizar = async (req, res) => {
  const { id } = req.params;
  const {
    nombre, apellidos, email, rol_id,
    unidad_negocio_id, departamento_id,
    puesto, reporta_a_id, nivel_jerarquico, activo
  } = req.body;

  try {
    const anterior = await query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!anterior.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // No puede cambiarse a si mismo el rol
    if (parseInt(id) === req.usuario.id && rol_id && rol_id !== req.usuario.rol_id) {
      return res.status(403).json({ error: 'No puedes cambiar tu propio rol' });
    }

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE usuarios SET
          nombre = COALESCE($1, nombre),
          apellidos = COALESCE($2, apellidos),
          email = COALESCE($3, email),
          rol_id = COALESCE($4, rol_id),
          unidad_negocio_id = $5,
          departamento_id = $6,
          puesto = COALESCE($7, puesto),
          reporta_a_id = $8,
          nivel_jerarquico = COALESCE($9, nivel_jerarquico),
          activo = COALESCE($10, activo),
          actualizado_en = NOW()
        WHERE id = $11
      `, [
        nombre, apellidos,
        email ? email.toLowerCase().trim() : null,
        rol_id, unidad_negocio_id, departamento_id,
        puesto, reporta_a_id, nivel_jerarquico, activo, id
      ]);

      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos, ip_address)
        VALUES ($1, 'usuarios', $2, 'UPDATE', $3, $4, $5)
      `, [req.usuario.id, id, JSON.stringify(anterior.rows[0]), JSON.stringify(req.body), req.ip]);
    });

    logger.info('Usuario actualizado', { id, por: req.usuario.email });
    return res.json({ ok: true, message: 'Usuario actualizado correctamente' });

  } catch (err) {
    logger.error('Error actualizando usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DELETE /api/usuarios/:id (desactivar — nunca eliminar) ─────
const desactivar = async (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.usuario.id) {
    return res.status(403).json({ error: 'No puedes desactivar tu propia cuenta' });
  }

  try {
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE usuarios SET activo = false, actualizado_en = NOW() WHERE id = $1',
        [id]
      );
      // Revocar sesiones activas
      await client.query(
        'UPDATE sesiones SET revocado = true WHERE usuario_id = $1',
        [id]
      );
      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
        VALUES ($1, 'usuarios', $2, 'DESACTIVAR', $3)
      `, [req.usuario.id, id, req.ip]);
    });

    logger.info('Usuario desactivado', { id, por: req.usuario.email });
    return res.json({ ok: true, message: 'Usuario desactivado correctamente' });

  } catch (err) {
    logger.error('Error desactivando usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/usuarios/:id/reset-password ─────────────────────
const resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const hash = await bcrypt.hash('Cambiar123!', BCRYPT_ROUNDS);
    await query(`
      UPDATE usuarios SET password_hash = $1, primer_login = true, actualizado_en = NOW()
      WHERE id = $2
    `, [hash, id]);

    await query(`
      INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
      VALUES ($1, 'usuarios', $2, 'RESET_PASSWORD', $3)
    `, [req.usuario.id, id, req.ip]);

    logger.info('Password reseteado', { id, por: req.usuario.email });
    return res.json({ ok: true, message: 'Password reseteado a: Cambiar123!' });

  } catch (err) {
    logger.error('Error en reset de password:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/usuarios/organigrama ─────────────────────────────
const organigrama = async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM organigrama WHERE activo = true ORDER BY orden
    `);
    return res.json({ ok: true, datos: result.rows });
  } catch (err) {
    logger.error('Error obteniendo organigrama:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/usuarios/organigrama ─────────────────────────────
const actualizarOrganigrama = async (req, res) => {
  const { filas } = req.body; // Array de registros del organigrama
  try {
    await withTransaction(async (client) => {
      for (const fila of filas) {
        if (fila.id) {
          await client.query(`
            UPDATE organigrama SET
              nombre = $1, puesto = $2, area = $3,
              reporta_a_nombre = $4, nivel_jerarquico = $5,
              rol_erp = $6, unidad = $7, activo = $8
            WHERE id = $9
          `, [fila.nombre, fila.puesto, fila.area, fila.reportaA,
              fila.nivel, fila.rolErp, fila.unidad, fila.activo !== false, fila.id]);
        } else {
          await client.query(`
            INSERT INTO organigrama (nombre, puesto, area, reporta_a_nombre, nivel_jerarquico, rol_erp, unidad)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `, [fila.nombre, fila.puesto, fila.area, fila.reportaA, fila.nivel, fila.rolErp, fila.unidad]);
        }
      }
      await client.query(`
        INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
        VALUES ($1, 'organigrama', 0, 'UPDATE_BULK', $2)
      `, [req.usuario.id, req.ip]);
    });
    return res.json({ ok: true, message: 'Organigrama actualizado' });
  } catch (err) {
    logger.error('Error actualizando organigrama:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listar, obtener, crear, actualizar, desactivar,
  resetPassword, organigrama, actualizarOrganigrama
};
