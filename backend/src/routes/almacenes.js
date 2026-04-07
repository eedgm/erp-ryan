const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ctrl = require('../controllers/almacenesController');

const router = express.Router();
router.use(verificarToken);

// ── Resumen/Dashboard ──────────────────────────────────────────
router.get('/almacenes/resumen', ctrl.resumen);

// ── Stock de un producto ──────────────────────────────────────
router.get('/inventario/stock', ctrl.stockProducto);

// ── Listar almacenes ──────────────────────────────────────────
router.get('/almacenes',
  filtrarPorUnidad,
  requirePermiso('almacenes','ver'),
  ctrl.listar
);

// ── Obtener almacen ───────────────────────────────────────────
router.get('/almacenes/:id',
  param('id').isInt(), validar,
  requirePermiso('almacenes','ver'),
  ctrl.obtener
);

// ── Inventario de un almacen ──────────────────────────────────
router.get('/almacenes/:id/inventario',
  param('id').isInt(), validar,
  requirePermiso('inventario','ver'),
  ctrl.inventarioAlmacen
);

// ── Movimientos de un almacen ─────────────────────────────────
router.get('/almacenes/:id/movimientos',
  param('id').isInt(), validar,
  requirePermiso('inventario','ver'),
  ctrl.movimientosAlmacen
);

// ── Exportar a Excel (datos JSON para SheetJS) ─────────────────
router.get('/almacenes/:id/exportar',
  param('id').isInt(), validar,
  requirePermiso('inventario','exportar'),
  ctrl.exportarInventario
);

// ── Crear almacen ─────────────────────────────────────────────
router.post('/almacenes',
  adminOCoord,
  requirePermiso('almacenes','crear'),
  [body('clave').notEmpty(), body('nombre').notEmpty(), validar],
  ctrl.crear
);

// ── Actualizar almacen ────────────────────────────────────────
router.put('/almacenes/:id',
  adminOCoord,
  requirePermiso('almacenes','editar'),
  [param('id').isInt(), validar],
  ctrl.actualizar
);

// ── Registrar movimiento (entrada / salida / ajuste) ──────────
router.post('/almacenes/movimiento',
  requirePermiso('inventario','crear'),
  [
    body('tipo').isIn([
      'entrada','salida','ajuste_positivo','ajuste_negativo','devolucion'
    ]).withMessage('Tipo de movimiento inválido'),
    body('producto_id').isInt(),
    body('cantidad').isFloat({ gt: 0 }).withMessage('Cantidad debe ser > 0'),
    body('fecha').isDate(),
    validar
  ],
  ctrl.registrarMovimiento
);

// ── Traspaso entre almacenes ──────────────────────────────────
router.post('/almacenes/traspaso',
  adminOCoord,
  requirePermiso('inventario','crear'),
  [
    body('almacen_origen_id').isInt(),
    body('almacen_destino_id').isInt(),
    body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
    body('items.*.producto_id').isInt(),
    body('items.*.cantidad').isFloat({ gt: 0 }),
    validar
  ],
  ctrl.traspaso
);

// ── Importar CSV ──────────────────────────────────────────────
router.post('/almacenes/:id/importar-csv',
  adminOCoord,
  requirePermiso('almacenes','editar'),
  [
    param('id').isInt(),
    body('modo').isIn(['reemplazar','agregar']),
    body('filas').isArray({ min: 1 }),
    validar
  ],
  ctrl.importarCSV
);

module.exports = router;
