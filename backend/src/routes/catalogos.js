const express = require('express');
const { body, param } = require('express-validator');
const {
  verificarToken, adminOCoord, soloAdmin,
  requirePermiso, filtrarPorUnidad
} = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const {
  clientes, proveedores, productos,
  tiposCambio, financiero, catalogosAux
} = require('../controllers/catalogController');

const router = express.Router();

// ── Auxiliares ────────────────────────────────────────────────
router.get('/categorias', verificarToken, catalogosAux.categorias);
router.get('/familias',   verificarToken, catalogosAux.familias);

// ── Clientes ──────────────────────────────────────────────────
router.get('/clientes',
  verificarToken, requirePermiso('clientes','ver'), filtrarPorUnidad,
  clientes.listar);
router.get('/clientes/:id',
  verificarToken, requirePermiso('clientes','ver'),
  param('id').isInt(), validar, clientes.obtener);
router.post('/clientes',
  verificarToken, requirePermiso('clientes','crear'),
  body('nombre').notEmpty(), validar, clientes.crear);
router.put('/clientes/:id',
  verificarToken, requirePermiso('clientes','editar'),
  param('id').isInt(), body('nombre').notEmpty(), validar, clientes.actualizar);
router.delete('/clientes/:id',
  verificarToken, soloAdmin,
  param('id').isInt(), validar, clientes.desactivar);

// ── Proveedores ───────────────────────────────────────────────
router.get('/proveedores',
  verificarToken, requirePermiso('proveedores','ver'), proveedores.listar);
router.get('/proveedores/:id',
  verificarToken, requirePermiso('proveedores','ver'),
  param('id').isInt(), validar, proveedores.obtener);
router.post('/proveedores',
  verificarToken, requirePermiso('proveedores','crear'),
  body('nombre').notEmpty(), validar, proveedores.crear);
router.put('/proveedores/:id',
  verificarToken, requirePermiso('proveedores','editar'),
  param('id').isInt(), body('nombre').notEmpty(), validar, proveedores.actualizar);
router.delete('/proveedores/:id',
  verificarToken, soloAdmin,
  param('id').isInt(), validar, proveedores.desactivar);

// ── Productos / Servicios ─────────────────────────────────────
router.get('/productos',
  verificarToken, requirePermiso('inventario','ver'), productos.listar);
router.get('/productos/:id',
  verificarToken, requirePermiso('inventario','ver'),
  param('id').isInt(), validar, productos.obtener);
router.post('/productos',
  verificarToken, adminOCoord,
  [body('nombre').notEmpty(), body('tipo').notEmpty()], validar, productos.crear);
router.put('/productos/:id',
  verificarToken, adminOCoord,
  param('id').isInt(), body('nombre').notEmpty(), validar, productos.actualizar);

// ── Tipos de Cambio ───────────────────────────────────────────
router.get('/tipos-cambio',           verificarToken, tiposCambio.hoy);
router.get('/tipos-cambio/historico', verificarToken, tiposCambio.historico);
router.get('/tipos-cambio/convertir', verificarToken, tiposCambio.convertir);
router.post('/tipos-cambio',
  verificarToken, adminOCoord,
  [body('fecha').isDate(), body('moneda').notEmpty(), body('a_mxn').isFloat()],
  validar, tiposCambio.registrar);

// ── Cuentas Bancarias ─────────────────────────────────────────
router.get('/cuentas-bancarias',  verificarToken, financiero.listarCuentas);
router.post('/cuentas-bancarias',
  verificarToken, soloAdmin,
  [body('banco').notEmpty(), body('nombre_cuenta').notEmpty()],
  validar, financiero.crearCuenta);

// ── Carteras Cripto ───────────────────────────────────────────
router.get('/carteras-cripto',  verificarToken, financiero.listarCarteras);
router.post('/carteras-cripto',
  verificarToken, soloAdmin,
  [body('nombre').notEmpty(), body('moneda').isIn(['USDT','USDC','BTC','ETH'])],
  validar, financiero.crearCartera);

// ── Resumen financiero ────────────────────────────────────────
router.get('/resumen-financiero', verificarToken, adminOCoord, financiero.resumenFinanciero);

module.exports = router;
