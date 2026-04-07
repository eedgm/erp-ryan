const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, soloAdmin, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ingCtrl  = require('../controllers/ingresosController');
const gasCtrl  = require('../controllers/gastosController');
const ivaCtrl  = require('../controllers/ivaController');

const router = express.Router();
router.use(verificarToken);

// ════════════════════════════════════════════════════════════
// INGRESOS
// ════════════════════════════════════════════════════════════
router.get('/ingresos',
  filtrarPorUnidad, requirePermiso('ingresos','ver'),
  ingCtrl.listar
);

router.get('/ingresos/:id',
  param('id').isInt(), validar,
  requirePermiso('ingresos','ver'),
  ingCtrl.obtener
);

router.post('/ingresos',
  requirePermiso('ingresos','crear'),
  [
    body('unidad_negocio_id').isInt().withMessage('Unidad requerida'),
    body('fecha').isDate().withMessage('Fecha inválida'),
    body('concepto').notEmpty().withMessage('Concepto requerido'),
    body('partidas').isArray({ min:1 }).withMessage('Al menos una partida requerida'),
    body('partidas.*.descripcion').notEmpty(),
    body('partidas.*.precio_unitario').isFloat({ gte:0 }),
    validar
  ],
  ingCtrl.crear
);

router.put('/ingresos/:id',
  requirePermiso('ingresos','editar'),
  [param('id').isInt(), validar],
  ingCtrl.actualizar
);

// Registrar cobro
router.post('/ingresos/:id/cobros',
  requirePermiso('ingresos','crear'),
  [
    param('id').isInt(),
    body('fecha').isDate().withMessage('Fecha requerida'),
    body('monto').isFloat({ gt:0 }).withMessage('Monto debe ser > 0'),
    validar
  ],
  ingCtrl.registrarCobro
);

// ════════════════════════════════════════════════════════════
// GASTOS
// ════════════════════════════════════════════════════════════
router.get('/gastos',
  filtrarPorUnidad, requirePermiso('gastos','ver'),
  gasCtrl.listar
);

router.get('/gastos/:id',
  param('id').isInt(), validar,
  requirePermiso('gastos','ver'),
  gasCtrl.obtener
);

router.post('/gastos',
  requirePermiso('gastos','crear'),
  [
    body('unidad_negocio_id').isInt().withMessage('Unidad requerida'),
    body('fecha').isDate().withMessage('Fecha inválida'),
    body('concepto').notEmpty().withMessage('Concepto requerido'),
    body('partidas').isArray({ min:1 }).withMessage('Al menos una partida requerida'),
    body('partidas.*.descripcion').notEmpty(),
    body('partidas.*.precio_unitario').isFloat({ gte:0 }),
    validar
  ],
  gasCtrl.crear
);

router.put('/gastos/:id',
  requirePermiso('gastos','editar'),
  [param('id').isInt(), validar],
  gasCtrl.actualizar
);

// Registrar pago
router.post('/gastos/:id/pagos',
  requirePermiso('gastos','crear'),
  [
    param('id').isInt(),
    body('fecha').isDate(),
    body('monto').isFloat({ gt:0 }),
    validar
  ],
  gasCtrl.registrarPago
);

// ════════════════════════════════════════════════════════════
// IVA
// ════════════════════════════════════════════════════════════
router.get('/iva/periodos',   ivaCtrl.listarPeriodos);
router.get('/iva/anual',      ivaCtrl.resumenAnual);

router.get('/iva/periodo/:anio/:mes',
  [param('anio').isInt(), param('mes').isInt({min:1,max:12}), validar],
  ivaCtrl.detallePeriodo
);

router.patch('/iva/periodo/:anio/:mes/cerrar',
  adminOCoord,
  [param('anio').isInt(), param('mes').isInt({min:1,max:12}), validar],
  ivaCtrl.cerrarPeriodo
);

module.exports = router;
