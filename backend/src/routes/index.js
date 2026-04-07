const express = require('express');
const { body, param, query: qv } = require('express-validator');
const { verificarToken, soloAdmin, adminOCoord } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const usuariosCtrl = require('../controllers/usuariosController');
const { validar } = require('../middleware/validar');

const router = express.Router();

// ── AUTH ──────────────────────────────────────────────────────
router.post('/auth/login',
  [
    body('email').isEmail().withMessage('Email invalido').normalizeEmail(),
    body('password').notEmpty().withMessage('Password requerido'),
    validar
  ],
  authCtrl.login
);

router.post('/auth/refresh',
  body('refreshToken').notEmpty().withMessage('Refresh token requerido'),
  validar,
  authCtrl.refresh
);

router.post('/auth/logout',
  verificarToken,
  authCtrl.logout
);

router.post('/auth/cambiar-password',
  verificarToken,
  [
    body('passwordActual').notEmpty(),
    body('passwordNuevo')
      .isLength({ min: 8 }).withMessage('Minimo 8 caracteres')
      .matches(/[A-Z]/).withMessage('Debe tener al menos una mayuscula')
      .matches(/[0-9]/).withMessage('Debe tener al menos un numero'),
    validar
  ],
  authCtrl.cambiarPassword
);

router.get('/auth/me', verificarToken, authCtrl.me);

// ── USUARIOS ──────────────────────────────────────────────────
router.get('/usuarios',
  verificarToken, adminOCoord,
  usuariosCtrl.listar
);

router.get('/usuarios/organigrama',
  verificarToken,
  usuariosCtrl.organigrama
);

router.get('/usuarios/:id',
  verificarToken, adminOCoord,
  param('id').isInt(),
  validar,
  usuariosCtrl.obtener
);

router.post('/usuarios',
  verificarToken, soloAdmin,
  [
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('email').isEmail().withMessage('Email invalido').normalizeEmail(),
    body('rol_id').isInt().withMessage('Rol requerido'),
    validar
  ],
  usuariosCtrl.crear
);

router.put('/usuarios/:id',
  verificarToken, soloAdmin,
  param('id').isInt(),
  validar,
  usuariosCtrl.actualizar
);

router.delete('/usuarios/:id',
  verificarToken, soloAdmin,
  param('id').isInt(),
  validar,
  usuariosCtrl.desactivar
);

router.post('/usuarios/:id/reset-password',
  verificarToken, soloAdmin,
  param('id').isInt(),
  validar,
  usuariosCtrl.resetPassword
);

router.put('/usuarios/organigrama/bulk',
  verificarToken, soloAdmin,
  body('filas').isArray().withMessage('filas debe ser un array'),
  validar,
  usuariosCtrl.actualizarOrganigrama
);

// ── CATÁLOGOS BASE ─────────────────────────────────────────────
router.get('/roles', verificarToken, async (req, res) => {
  const { query } = require('../config/database');
  const rows = await query('SELECT * FROM roles ORDER BY nivel');
  res.json({ ok: true, datos: rows.rows });
});

router.get('/unidades', verificarToken, async (req, res) => {
  const { query } = require('../config/database');
  const rows = await query('SELECT * FROM unidades_negocio WHERE activo = true ORDER BY id');
  res.json({ ok: true, datos: rows.rows });
});

router.get('/permisos/:rol_id', verificarToken, soloAdmin, async (req, res) => {
  const { query } = require('../config/database');
  const rows = await query('SELECT * FROM permisos WHERE rol_id = $1 ORDER BY modulo', [req.params.rol_id]);
  res.json({ ok: true, datos: rows.rows });
});

module.exports = router;
