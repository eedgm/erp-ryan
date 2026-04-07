// migrate-all.js
// Ejecuta todas las migraciones en orden: Sprint 1 al 9
require('dotenv').config();
const { pool } = require('./database');
const logger   = require('../utils/logger');

const migrations = [
  { sprint: 1, file: './migrate'  },
  { sprint: 2, file: './migrate2' },
  { sprint: 3, file: './migrate3' },
  { sprint: 4, file: './migrate4' },
  { sprint: 5, file: './migrate5' },
  { sprint: 6, file: './migrate6' },
  { sprint: 7, file: './migrate7' },
  // Sprint 8 no tiene migración (usa tablas existentes)
  { sprint: 9, file: './migrate9' },
];

const runAll = async () => {
  logger.info('=== Iniciando migraciones de todos los sprints ===');
  for (const m of migrations) {
    try {
      logger.info(`Corriendo migración Sprint ${m.sprint}...`);
      // Cargar y ejecutar el SQL de cada migración directamente
      const migration = require(m.file);
      if (typeof migration === 'function') {
        await migration(pool);
      }
      logger.info(`✓ Sprint ${m.sprint} OK`);
    } catch (err) {
      logger.error(`✗ Sprint ${m.sprint} ERROR: ${err.message}`);
      // Continuar con las demás
    }
  }
  logger.info('=== Migraciones completadas ===');
  process.exit(0);
};

runAll();
