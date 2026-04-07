// seed-all.js
// Inserta datos iniciales: usuarios del organigrama + empleados
require('dotenv').config();
const logger = require('../utils/logger');

const runAll = async () => {
  logger.info('=== Iniciando seed de datos iniciales ===');

  logger.info('Seed 1: Usuarios, roles y organigrama...');
  try { await require('./seed')(); }
  catch (e) { logger.error('Error seed1:', e.message); }

  logger.info('Seed 9: Empleados y contratos...');
  try { await require('./seed9')(); }
  catch (e) { logger.error('Error seed9:', e.message); }
};

runAll().then(() => process.exit(0)).catch(() => process.exit(1));
