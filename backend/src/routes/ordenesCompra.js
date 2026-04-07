const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ctrl = require('../controllers/ordenesCompraController');

const router = express.Router();
router.use(verificarToken);

// ── Verificar stock (antes de crear OC) ───────────────────────
router.post('/ordenes-compra/verificar-stock',
  requirePermiso('ordenes_compra','ver'),
  [body('items').isArray({ min: 1 }), validar],
  ctrl.verificarStockEndpoint
);

// ── Panel de requisiciones ────────────────────────────────────
router.get('/requisiciones',
  filtrarPorUnidad,
  requirePermiso('compras','ver'),
  ctrl.listarRequisiciones
);

// ── Asignar proveedor a requisición ───────────────────────────
router.patch('/requisiciones/:id/proveedor',
  requirePermiso('compras','editar'),
  [param('id').isInt(), body('proveedor_id').isInt(), validar],
  ctrl.asignarProveedor
);

// ── Listar OC ─────────────────────────────────────────────────
router.get('/ordenes-compra',
  filtrarPorUnidad,
  requirePermiso('ordenes_compra','ver'),
  ctrl.listar
);

// ── Detalle OC ────────────────────────────────────────────────
router.get('/ordenes-compra/:id',
  param('id').isInt(), validar,
  requirePermiso('ordenes_compra','ver'),
  ctrl.obtener
);

// ── Crear OC ──────────────────────────────────────────────────
router.post('/ordenes-compra',
  requirePermiso('ordenes_compra','crear'),
  [
    body('unidad_negocio_id').isInt().withMessage('Unidad requerida'),
    body('partidas').isArray({ min: 1 }).withMessage('Debe incluir al menos una partida'),
    body('partidas.*.descripcion').notEmpty().withMessage('Descripción de partida requerida'),
    body('partidas.*.cantidad_solicitada').isFloat({ gt: 0 }),
    validar
  ],
  ctrl.crear
);

// ── Autorizar OC ──────────────────────────────────────────────
router.patch('/ordenes-compra/:id/autorizar',
  adminOCoord,
  requirePermiso('ordenes_compra','autorizar'),
  [param('id').isInt(), validar],
  ctrl.autorizar
);

// ── Enviar por email ──────────────────────────────────────────
router.post('/ordenes-compra/:id/enviar-email',
  adminOCoord,
  requirePermiso('ordenes_compra','editar'),
  [param('id').isInt(), validar],
  ctrl.enviarEmail
);

// ── Registrar recepción ───────────────────────────────────────
router.post('/ordenes-compra/:id/recepcion',
  requirePermiso('ordenes_compra','editar'),
  [
    param('id').isInt(),
    body('recepciones').isArray({ min: 1 }),
    body('recepciones.*.oc_partida_id').isInt(),
    body('recepciones.*.cantidad_recibida').isFloat({ gt: 0 }),
    validar
  ],
  ctrl.registrarRecepcion
);

// ── Cancelar OC ───────────────────────────────────────────────
router.patch('/ordenes-compra/:id/cancelar',
  adminOCoord,
  requirePermiso('ordenes_compra','eliminar'),
  [param('id').isInt(), validar],
  ctrl.cancelar
);

module.exports = router;
