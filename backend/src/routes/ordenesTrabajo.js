const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ctrl = require('../controllers/ordenesTrabajoController');

const router = express.Router();
router.use(verificarToken);

// Dashboard
router.get('/ordenes-trabajo/dashboard', filtrarPorUnidad, ctrl.dashboard);

// Listado
router.get('/ordenes-trabajo',
  filtrarPorUnidad,
  requirePermiso('ordenes_trabajo','ver'),
  ctrl.listar
);

// Detalle
router.get('/ordenes-trabajo/:id',
  param('id').isInt(), validar,
  requirePermiso('ordenes_trabajo','ver'),
  ctrl.obtener
);

// Crear
router.post('/ordenes-trabajo',
  requirePermiso('ordenes_trabajo','crear'),
  [
    body('tipo').isIn(['traspaso_a_folio','consumo_directo','devolucion_almacen','ajuste_inventario']),
    body('unidad_negocio_id').isInt(),
    body('almacen_origen_id').isInt(),
    body('partidas').isArray({ min: 1 }),
    body('partidas.*.producto_id').isInt(),
    body('partidas.*.cantidad_solicitada').isFloat({ gt: 0 }),
    validar
  ],
  ctrl.crear
);

// Solicitar autorización
router.patch('/ordenes-trabajo/:id/solicitar',
  requirePermiso('ordenes_trabajo','editar'),
  [param('id').isInt(), validar],
  ctrl.solicitarAutorizacion
);

// Autorizar (solo nivel 1 o 2)
router.patch('/ordenes-trabajo/:id/autorizar',
  adminOCoord,
  requirePermiso('ordenes_trabajo','autorizar'),
  [param('id').isInt(), validar],
  ctrl.autorizar
);

// Ejecutar (mueve inventario)
router.post('/ordenes-trabajo/:id/ejecutar',
  adminOCoord,
  requirePermiso('ordenes_trabajo','autorizar'),
  [param('id').isInt(), validar],
  ctrl.ejecutar
);

// Cancelar
router.patch('/ordenes-trabajo/:id/cancelar',
  adminOCoord,
  requirePermiso('ordenes_trabajo','eliminar'),
  [param('id').isInt(), validar],
  ctrl.cancelar
);

module.exports = router;
