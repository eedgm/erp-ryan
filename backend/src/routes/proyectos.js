const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ctrl = require('../controllers/proyectosController');

const router = express.Router();
router.use(verificarToken);

// ── Dashboard ─────────────────────────────────────────────────
router.get('/proyectos/dashboard',
  filtrarPorUnidad,
  ctrl.dashboard
);

// ── Listado ───────────────────────────────────────────────────
router.get('/proyectos',
  filtrarPorUnidad,
  requirePermiso('proyectos','ver'),
  ctrl.listar
);

// ── Detalle ───────────────────────────────────────────────────
router.get('/proyectos/:id',
  param('id').isInt(), validar,
  requirePermiso('proyectos','ver'),
  ctrl.obtener
);

// ── Presupuesto ───────────────────────────────────────────────
router.get('/proyectos/:id/presupuesto',
  param('id').isInt(), validar,
  requirePermiso('proyectos','ver'),
  ctrl.presupuesto
);

// ── Crear ─────────────────────────────────────────────────────
router.post('/proyectos',
  requirePermiso('proyectos','crear'),
  [
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('unidad_negocio_id').isInt().withMessage('Unidad de negocio requerida'),
    body('presupuesto_global').isFloat({ gt: 0 }).withMessage('Presupuesto global requerido > 0'),
    body('familias').isArray({ min: 1 }).withMessage('Debe definir al menos una familia de presupuesto'),
    body('familias.*.nombre_familia').notEmpty().withMessage('Cada familia debe tener nombre'),
    body('familias.*.presupuesto').isFloat({ gte: 0 }).withMessage('Presupuesto de familia inválido'),
    validar
  ],
  ctrl.crear
);

// ── Actualizar ────────────────────────────────────────────────
router.put('/proyectos/:id',
  requirePermiso('proyectos','editar'),
  [param('id').isInt(), body('nombre').notEmpty(), validar],
  ctrl.actualizar
);

// ── Cambiar Estado ────────────────────────────────────────────
router.patch('/proyectos/:id/estado',
  requirePermiso('proyectos','editar'),
  adminOCoord,
  [
    param('id').isInt(),
    body('estado').isIn(['Activo','Pausado','Cerrado','Cancelado']).withMessage('Estado inválido'),
    validar
  ],
  ctrl.cambiarEstado
);

module.exports = router;
