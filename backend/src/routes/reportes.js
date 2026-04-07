const express = require('express');
const { verificarToken, requirePermiso, filtrarPorUnidad } = require('../middleware/auth');
const ctrl = require('../controllers/reportesController');

const router = express.Router();
router.use(verificarToken);
router.use(filtrarPorUnidad);

// Todos los reportes requieren permiso de ver reportes
const guard = requirePermiso('reportes','ver');

router.get('/reportes/dashboard-financiero',    guard, ctrl.dashboardFinanciero);
router.get('/reportes/estado-resultados',       guard, ctrl.estadoResultados);
router.get('/reportes/rentabilidad-proyectos',  guard, ctrl.rentabilidadProyectos);
router.get('/reportes/flujo-efectivo',          guard, ctrl.flujoEfectivo);
router.get('/reportes/cuentas-por-cobrar',      guard, ctrl.cuentasPorCobrar);
router.get('/reportes/cuentas-por-pagar',       guard, ctrl.cuentasPorPagar);

module.exports = router;
