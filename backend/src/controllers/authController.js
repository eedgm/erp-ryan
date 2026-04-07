const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, withTransaction } = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET          = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN      = process.env.JWT_EXPIRES_IN || '8h';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS       = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const MAX_INTENTOS        = 5;
const BLOQUEO_MINUTOS     = 30;

// ── Genera token JWT ──────────────────────────────────────────
const generarToken = (usuario) => {
  return jwt.sign(
    {
      id:       usuario.id,
      email:    usuario.email,
      rol_id:   usuario.rol_id,
      rol_nivel:usuario.rol_nivel,
      rol_nombre:usuario.rol_nombre,
      unidad_id:usuario.unidad_negocio_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// ── Genera refresh token ──────────────────────────────────────
const generarRefreshToken = () => crypto.randomBytes(64).toString('hex');

// ── Hash de token para guardar en BD ─────────────────────────
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    // Buscar usuario con datos de rol
    const result = await query(`
      SELECT
        u.id, u.nombre, u.apellidos, u.email,
        u.password_hash, u.activo, u.primer_login,
        u.intentos_fallidos, u.bloqueado_hasta,
        u.unidad_negocio_id, u.puesto,
        r.id   AS rol_id,
        r.nombre AS rol_nombre,
        r.nivel  AS rol_nivel,
        un.codigo AS unidad_codigo,
        un.nombre AS unidad_nombre
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      LEFT JOIN unidades_negocio un ON u.unidad_negocio_id = un.id
      WHERE u.email = $1
    `, [email.toLowerCase().trim()]);

    const usuario = result.rows[0];

    // Usuario no existe — respuesta genérica por seguridad
    if (!usuario) {
      logger.warn('Intento de login con email inexistente', { email, ip });
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    // Cuenta inactiva
    if (!usuario.activo) {
      return res.status(401).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    // Cuenta bloqueada temporalmente
    if (usuario.bloqueado_hasta && new Date() < new Date(usuario.bloqueado_hasta)) {
      const minutos = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
      return res.status(429).json({
        error: `Cuenta bloqueada por ${minutos} minuto(s) por intentos fallidos.`
      });
    }

    // Verificar password
    const passwordOk = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordOk) {
      const intentos = usuario.intentos_fallidos + 1;
      let bloqueadoHasta = null;

      if (intentos >= MAX_INTENTOS) {
        bloqueadoHasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
        logger.warn('Cuenta bloqueada por intentos fallidos', { email, ip, intentos });
      }

      await query(`
        UPDATE usuarios
        SET intentos_fallidos = $1, bloqueado_hasta = $2
        WHERE id = $3
      `, [intentos, bloqueadoHasta, usuario.id]);

      return res.status(401).json({
        error: intentos >= MAX_INTENTOS
          ? `Cuenta bloqueada por ${BLOQUEO_MINUTOS} minutos.`
          : `Credenciales invalidas. Intentos restantes: ${MAX_INTENTOS - intentos}`
      });
    }

    // Login exitoso — resetear intentos
    await query(`
      UPDATE usuarios
      SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW()
      WHERE id = $1
    `, [usuario.id]);

    // Obtener permisos del rol
    const permisosRes = await query(`
      SELECT modulo, puede_ver, puede_crear, puede_editar,
             puede_eliminar, puede_exportar, puede_autorizar
      FROM permisos WHERE rol_id = $1
    `, [usuario.rol_id]);

    const permisos = {};
    permisosRes.rows.forEach(p => { permisos[p.modulo] = p; });

    // Generar tokens
    const accessToken  = generarToken(usuario);
    const refreshToken = generarRefreshToken();
    const refreshHash  = hashToken(refreshToken);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Guardar refresh token
    await query(`
      INSERT INTO refresh_tokens (usuario_id, token_hash, ip_address, expira_en)
      VALUES ($1, $2, $3, $4)
    `, [usuario.id, refreshHash, ip, refreshExpiry]);

    // Guardar sesión
    const tokenHash = hashToken(accessToken);
    const sessionExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await query(`
      INSERT INTO sesiones (usuario_id, token_hash, ip_address, user_agent, expira_en)
      VALUES ($1, $2, $3, $4, $5)
    `, [usuario.id, tokenHash, ip, req.headers['user-agent']?.substring(0,500), sessionExpiry]);

    // Bitácora
    await query(`
      INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, datos_nuevos, ip_address)
      VALUES ($1, 'sesiones', $2, 'LOGIN', $3, $4)
    `, [usuario.id, usuario.id, JSON.stringify({ email: usuario.email }), ip]);

    logger.info('Login exitoso', { userId: usuario.id, email: usuario.email, ip });

    return res.json({
      ok: true,
      accessToken,
      refreshToken,
      primerLogin: usuario.primer_login,
      usuario: {
        id:           usuario.id,
        nombre:       usuario.nombre,
        apellidos:    usuario.apellidos,
        email:        usuario.email,
        puesto:       usuario.puesto,
        rol:          { id: usuario.rol_id, nombre: usuario.rol_nombre, nivel: usuario.rol_nivel },
        unidad:       usuario.unidad_codigo ? { codigo: usuario.unidad_codigo, nombre: usuario.unidad_nombre } : null,
        permisos,
      }
    });

  } catch (err) {
    logger.error('Error en login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ────────────────────────────────────────────────────────────
const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });

  try {
    const hash = hashToken(refreshToken);
    const result = await query(`
      SELECT rt.*, u.id as uid, u.email, u.activo, u.rol_id, u.unidad_negocio_id, u.puesto,
             r.nombre as rol_nombre, r.nivel as rol_nivel
      FROM refresh_tokens rt
      JOIN usuarios u ON rt.usuario_id = u.id
      JOIN roles r ON u.rol_id = r.id
      WHERE rt.token_hash = $1 AND rt.usado = false AND rt.expira_en > NOW()
    `, [hash]);

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Refresh token invalido o expirado' });
    }

    const row = result.rows[0];
    if (!row.activo) return res.status(401).json({ error: 'Cuenta desactivada' });

    // Marcar como usado (rotacion de tokens)
    await query('UPDATE refresh_tokens SET usado = true WHERE id = $1', [row.id]);

    // Generar nuevos tokens
    const newAccessToken  = generarToken({ ...row, id: row.uid });
    const newRefreshToken = generarRefreshToken();
    const newRefreshHash  = hashToken(newRefreshToken);
    const refreshExpiry   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(`
      INSERT INTO refresh_tokens (usuario_id, token_hash, ip_address, expira_en)
      VALUES ($1, $2, $3, $4)
    `, [row.uid, newRefreshHash, req.ip, refreshExpiry]);

    return res.json({ ok: true, accessToken: newAccessToken, refreshToken: newRefreshToken });

  } catch (err) {
    logger.error('Error en refresh:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Revocar sesiones activas
    await query('UPDATE sesiones SET revocado = true WHERE usuario_id = $1 AND revocado = false', [userId]);
    // Invalidar refresh tokens
    await query('UPDATE refresh_tokens SET usado = true WHERE usuario_id = $1 AND usado = false', [userId]);

    await query(`
      INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
      VALUES ($1, 'sesiones', $2, 'LOGOUT', $3)
    `, [userId, userId, req.ip]);

    logger.info('Logout exitoso', { userId });
    return res.json({ ok: true, message: 'Sesion cerrada correctamente' });

  } catch (err) {
    logger.error('Error en logout:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/cambiar-password
// ────────────────────────────────────────────────────────────
const cambiarPassword = async (req, res) => {
  const { passwordActual, passwordNuevo } = req.body;
  const userId = req.usuario.id;

  try {
    const result = await query('SELECT password_hash FROM usuarios WHERE id = $1', [userId]);
    const usuario = result.rows[0];
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password actual incorrecto' });

    const nuevoHash = await bcrypt.hash(passwordNuevo, BCRYPT_ROUNDS);
    await query(`
      UPDATE usuarios
      SET password_hash = $1, primer_login = false, actualizado_en = NOW()
      WHERE id = $2
    `, [nuevoHash, userId]);

    await query(`
      INSERT INTO bitacora (usuario_id, tabla, registro_id, accion, ip_address)
      VALUES ($1, 'usuarios', $2, 'CAMBIO_PASSWORD', $3)
    `, [userId, userId, req.ip]);

    logger.info('Password cambiado', { userId });
    return res.json({ ok: true, message: 'Password actualizado correctamente' });

  } catch (err) {
    logger.error('Error en cambio de password:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────────────────────────
const me = async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.nombre, u.apellidos, u.email, u.puesto, u.primer_login, u.ultimo_acceso,
             u.unidad_negocio_id, u.nivel_jerarquico,
             r.id as rol_id, r.nombre as rol_nombre, r.nivel as rol_nivel,
             un.codigo as unidad_codigo, un.nombre as unidad_nombre
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      LEFT JOIN unidades_negocio un ON u.unidad_negocio_id = un.id
      WHERE u.id = $1 AND u.activo = true
    `, [req.usuario.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const u = result.rows[0];
    const permisosRes = await query(
      'SELECT * FROM permisos WHERE rol_id = $1', [u.rol_id]
    );
    const permisos = {};
    permisosRes.rows.forEach(p => { permisos[p.modulo] = p; });

    return res.json({
      ok: true,
      usuario: {
        id: u.id, nombre: u.nombre, apellidos: u.apellidos,
        email: u.email, puesto: u.puesto, primerLogin: u.primer_login,
        ultimoAcceso: u.ultimo_acceso, nivelJerarquico: u.nivel_jerarquico,
        rol: { id: u.rol_id, nombre: u.rol_nombre, nivel: u.rol_nivel },
        unidad: u.unidad_codigo ? { codigo: u.unidad_codigo, nombre: u.unidad_nombre } : null,
        permisos,
      }
    });

  } catch (err) {
    logger.error('Error en /me:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { login, logout, refresh, cambiarPassword, me };
