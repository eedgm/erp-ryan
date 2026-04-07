const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// ── Verificar JWT ─────────────────────────────────────────────
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Verificar que el usuario sigue activo en BD
    const result = await query(
      'SELECT id, activo FROM usuarios WHERE id = $1',
      [payload.id]
    );

    if (!result.rows.length || !result.rows[0].activo) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    req.usuario = payload;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token invalido' });
    }
    logger.error('Error en verificacion de token:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── Requerir nivel de rol ─────────────────────────────────────
// nivel 1 = Admin, 2 = Coordinador, 3 = Captura
// requireNivel(2) permite Admin y Coordinador
const requireNivel = (nivelMaximo) => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });

  if (req.usuario.rol_nivel > nivelMaximo) {
    return res.status(403).json({
      error: 'Permisos insuficientes para esta accion',
      requerido: `Nivel ${nivelMaximo} o superior`,
      actual: `Nivel ${req.usuario.rol_nivel} (${req.usuario.rol_nombre})`
    });
  }
  next();
};

// ── Solo Administrador ────────────────────────────────────────
const soloAdmin = requireNivel(1);

// ── Admin o Coordinador ───────────────────────────────────────
const adminOCoord = requireNivel(2);

// ── Verificar permiso especifico en modulo ────────────────────
const requirePermiso = (modulo, accion) => async (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });

  // Admin siempre pasa
  if (req.usuario.rol_nivel === 1) return next();

  try {
    const result = await query(
      `SELECT * FROM permisos WHERE rol_id = $1 AND modulo = $2`,
      [req.usuario.rol_id, modulo]
    );

    if (!result.rows.length) {
      return res.status(403).json({ error: `Sin acceso al modulo: ${modulo}` });
    }

    const permiso = result.rows[0];
    const campoAccion = `puede_${accion}`;

    if (!permiso[campoAccion]) {
      return res.status(403).json({
        error: `No tienes permiso para: ${accion} en ${modulo}`
      });
    }

    req.permiso = permiso;
    next();

  } catch (err) {
    logger.error('Error verificando permiso:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── Filtro por unidad de negocio ──────────────────────────────
// Coordinadores solo ven su unidad; Admins ven todo
const filtrarPorUnidad = (req, res, next) => {
  if (req.usuario.rol_nivel === 1) {
    // Admin ve todas las unidades
    req.unidadFiltro = null;
  } else {
    // Coordinador y Captura solo ven su unidad
    req.unidadFiltro = req.usuario.unidad_id || null;
  }
  next();
};

module.exports = {
  verificarToken,
  requireNivel,
  soloAdmin,
  adminOCoord,
  requirePermiso,
  filtrarPorUnidad,
};
