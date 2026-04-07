require('dotenv').config();
const { withTransaction } = require('./database');
const logger = require('../utils/logger');

const runSeed2 = async () => {
  logger.info('Iniciando seed Sprint 2 — Catalogos...');

  await withTransaction(async (client) => {

    // ── Familias de Presupuesto ──────────────────────────────
    await client.query(`
      INSERT INTO familias_presupuesto_catalogo (nombre, descripcion, orden) VALUES
        ('Material de Instalacion', 'Suministros, materiales y equipo para el proyecto', 1),
        ('Mano de Obra',            'Costo de personal tecnico asignado al proyecto',    2),
        ('Gestoria de Proyecto',    'Coordinacion, tramites, permisos e ingenieria',     3),
        ('Flete y Logistica',       'Transporte de materiales y equipo',                 4),
        ('Otros',                   'Gastos no clasificados en otras familias',           5)
      ON CONFLICT DO NOTHING
    `);

    // ── Categorías de Productos ──────────────────────────────
    const cats = await client.query(`
      INSERT INTO categorias_producto (nombre, tipo) VALUES
        ('Cables y Conductores',    'Suministro'),
        ('Conduit y Accesorios',    'Suministro'),
        ('Tableros y Protecciones', 'Suministro'),
        ('Iluminacion',             'Suministro'),
        ('Equipo de Medicion',      'Equipo'),
        ('Herramienta Electrica',   'Herramienta'),
        ('Herramienta Manual',      'Herramienta'),
        ('Productos RST',           'Suministro'),
        ('Ingenieria y Diseno',     'Servicio'),
        ('Supervision y Gestion',   'Servicio'),
        ('Mano de Obra Tecnica',    'Servicio'),
        ('Consultoria',             'Servicio')
      ON CONFLICT DO NOTHING
      RETURNING id, nombre
    `);

    const catMap = {};
    cats.rows.forEach(c => catMap[c.nombre] = c.id);

    // ── Productos de ejemplo ─────────────────────────────────
    await client.query(`
      INSERT INTO productos_servicios
        (codigo, nombre, tipo, categoria_id, unidad_medida,
         precio_venta_mxn, precio_venta_usd, costo_mxn, costo_usd,
         aplica_iva, tasa_iva, controla_inventario, stock_minimo)
      VALUES
        ('CAB-THW-12', 'Cable THW 12 AWG',        'Suministro', $1, 'Metro', 28.50, NULL, 18.50, NULL, true, 16, true, 200),
        ('CAB-THW-10', 'Cable THW 10 AWG',        'Suministro', $1, 'Metro', 42.00, NULL, 28.00, NULL, true, 16, true, 100),
        ('CON-EMT-34', 'Conduit EMT 3/4"',        'Suministro', $2, 'Tramo', 185.00,NULL, 124.00,NULL, true, 16, true, 50),
        ('CON-EMT-1',  'Conduit EMT 1"',          'Suministro', $2, 'Tramo', 245.00,NULL, 164.00,NULL, true, 16, true, 30),
        ('TAB-12C',    'Tablero 12 Circuitos',    'Suministro', $3, 'Pieza', 980.00,NULL, 650.00,NULL, true, 16, true, 5),
        ('TAB-24C',    'Tablero 24 Circuitos',    'Suministro', $3, 'Pieza',1850.00,NULL,1200.00,NULL, true, 16, true, 3),
        ('SRV-ING',    'Hora Ingenieria',         'Servicio',   $4, 'Hora',  850.00, 50.0, NULL, NULL, true, 16, false,0),
        ('SRV-SUP',    'Hora Supervision',        'Servicio',   $5, 'Hora',  650.00, 38.0, NULL, NULL, true, 16, false,0),
        ('SRV-TEC',    'Hora Tecnico Instalador', 'Servicio',   $6, 'Hora',  420.00, 24.0, NULL, NULL, true, 16, false,0)
      ON CONFLICT (codigo) DO NOTHING
    `, [
      catMap['Cables y Conductores'],
      catMap['Conduit y Accesorios'],
      catMap['Tableros y Protecciones'],
      catMap['Ingenieria y Diseno'],
      catMap['Supervision y Gestion'],
      catMap['Mano de Obra Tecnica'],
    ]);

    // ── Tipo de cambio inicial ───────────────────────────────
    const hoy = new Date().toISOString().split('T')[0];
    await client.query(`
      INSERT INTO tipos_cambio (fecha, moneda, a_mxn, a_usd, fuente) VALUES
        ($1, 'USD',  17.24,    1,        'Manual'),
        ($1, 'USDT', 17.24,    1,        'Manual'),
        ($1, 'USDC', 17.24,    1,        'Manual'),
        ($1, 'BTC',  1456380,  84500,    'Manual'),
        ($1, 'ETH',  58616,    3400,     'Manual')
      ON CONFLICT (fecha, moneda) DO NOTHING
    `, [hoy]);

    // ── Cuentas Bancarias de ejemplo ─────────────────────────
    await client.query(`
      INSERT INTO cuentas_bancarias (banco, nombre_cuenta, moneda) VALUES
        ('BBVA',     'Cuenta Principal MXN',  'MXN'),
        ('Banamex',  'Cuenta Operaciones MXN','MXN'),
        ('BBVA',     'Cuenta USD',            'USD')
      ON CONFLICT DO NOTHING
    `);

    // ── Carteras Cripto de ejemplo ───────────────────────────
    await client.query(`
      INSERT INTO carteras_cripto (nombre, moneda, red, exchange) VALUES
        ('Binance Principal USDT', 'USDT', 'TRC20',   'Binance'),
        ('Binance Principal USDC', 'USDC', 'BEP20',   'Binance'),
        ('Binance BTC',            'BTC',  'Bitcoin', 'Binance'),
        ('Binance ETH',            'ETH',  'ERC20',   'Binance')
      ON CONFLICT DO NOTHING
    `);

    logger.info('Seed Sprint 2 completado.', {
      familias: 5, categorias: 12, productos: 9,
      tiposCambio: 5, cuentasBancarias: 3, carterasCripto: 4
    });
  });

  process.exit(0);
};

runSeed2().catch(err => {
  logger.error('Error en seed Sprint 2:', err.message);
  process.exit(1);
});
