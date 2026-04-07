const express = require('express');
const { body, param } = require('express-validator');
const { verificarToken, soloAdmin, adminOCoord, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const ctrl = require('../controllers/rrhhController');

const router = express.Router();
router.use(verificarToken);

// ════════════════════════════════════════════════════════════
// EMPLEADOS
// ════════════════════════════════════════════════════════════
router.get('/rrhh/empleados',
  filtrarPorUnidad, requirePermiso('rrhh','ver'), ctrl.listarEmpleados
);

router.get('/rrhh/empleados/:id',
  param('id').isInt(), validar,
  requirePermiso('rrhh','ver'), ctrl.obtenerEmpleado
);

router.post('/rrhh/empleados',
  adminOCoord, requirePermiso('rrhh','crear'),
  [body('nombre').notEmpty().withMessage('Nombre requerido'), validar],
  ctrl.crearEmpleado
);

router.put('/rrhh/empleados/:id',
  adminOCoord, requirePermiso('rrhh','editar'),
  [param('id').isInt(), validar],
  ctrl.actualizarEmpleado
);

// ════════════════════════════════════════════════════════════
// ASISTENCIAS
// ════════════════════════════════════════════════════════════
router.get('/rrhh/asistencias',
  filtrarPorUnidad, requirePermiso('rrhh','ver'), ctrl.reporteAsistencias
);

router.post('/rrhh/asistencias/importar',
  adminOCoord, requirePermiso('rrhh','editar'),
  [
    body('fuente').isIn(['ZKTeco','App Movil','Manual']).withMessage('Fuente inválida'),
    body('filas').isArray({ min:1 }).withMessage('Sin filas a importar'),
    body('filas.*.id_biometrico').notEmpty().withMessage('ID biométrico requerido'),
    body('filas.*.fecha').isDate().withMessage('Fecha inválida en fila'),
    validar
  ],
  ctrl.importarAsistencias
);

// ════════════════════════════════════════════════════════════
// NÓMINA
// ════════════════════════════════════════════════════════════
router.get('/rrhh/nomina',
  filtrarPorUnidad, requirePermiso('nomina','ver'), ctrl.listarPeriodosNomina
);

router.get('/rrhh/nomina/:id',
  param('id').isInt(), validar,
  requirePermiso('nomina','ver'), ctrl.obtenerNomina
);

router.get('/rrhh/nomina/:id/exportar',
  param('id').isInt(), validar,
  requirePermiso('nomina','ver'), ctrl.exportarNomina
);

router.post('/rrhh/nomina',
  adminOCoord, requirePermiso('nomina','crear'),
  [
    body('nombre').notEmpty().withMessage('Nombre del periodo requerido'),
    body('periodicidad').isIn(['Semanal','Quincenal','Mensual']).withMessage('Periodicidad inválida'),
    body('fecha_inicio').isDate(),
    body('fecha_fin').isDate(),
    validar
  ],
  ctrl.crearPeriodoNomina
);

router.post('/rrhh/nomina/:id/calcular',
  adminOCoord, requirePermiso('nomina','editar'),
  [param('id').isInt(), validar],
  ctrl.calcularNomina
);

router.patch('/rrhh/nomina/:id/autorizar',
  soloAdmin, requirePermiso('nomina','autorizar'),
  [param('id').isInt(), validar],
  ctrl.autorizarNomina
);

router.patch('/rrhh/nomina/:id/pagar-linea/:lineaId',
  adminOCoord, requirePermiso('nomina','editar'),
  [param('id').isInt(), param('lineaId').isInt(),
   body('fecha').isDate(), body('forma_pago').notEmpty(), validar],
  ctrl.pagarLinea
);

module.exports = router;
