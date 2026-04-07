const { Pool } = require('pg');
const logger = require('../utils/logger');

const poolConfig = {
  max:      parseInt(process.env.DB_POOL_MAX) || 10,
  min:      parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: 5000,
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;

  try {
    const url = new URL(process.env.DATABASE_URL);
    logger.info('Configuracion PostgreSQL cargada desde DATABASE_URL', {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, ''),
      ssl: url.searchParams.get('sslmode') || 'default'
    });
  } catch {
    logger.warn('DATABASE_URL esta definido pero no se pudo parsear para diagnostico');
  }
} else {
  poolConfig.host     = process.env.DB_HOST     || 'localhost';
  poolConfig.port     = parseInt(process.env.DB_PORT) || 5432;
  poolConfig.database = process.env.DB_NAME     || 'erp';
  poolConfig.user     = process.env.DB_USER     || process.env.USER;
  poolConfig.password = process.env.DB_PASSWORD || '';

  logger.warn('DATABASE_URL no definido; usando variables DB_* o fallback local', {
    host: poolConfig.host,
    port: poolConfig.port,
    database: poolConfig.database,
    user: poolConfig.user || 'undefined'
  });
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  logger.debug('Nueva conexion a PostgreSQL establecida');
});

pool.on('error', (err) => {
  logger.error('Error inesperado en pool de PostgreSQL:', err);
});

// Helper para queries con manejo de errores
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query ejecutada', { text: text.substring(0, 80), duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Error en query', { text: text.substring(0, 80), error: err.message });
    throw err;
  }
};

// Helper para transacciones
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Verificar conexion al iniciar
const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() as now, version() as version');
    logger.info('Conexion a PostgreSQL OK', {
      timestamp: res.rows[0].now,
      version: res.rows[0].version.split(' ')[0] + ' ' + res.rows[0].version.split(' ')[1]
    });
    return true;
  } catch (err) {
    logger.error('No se pudo conectar a PostgreSQL:', err.message);
    return false;
  }
};

module.exports = { pool, query, withTransaction, testConnection };
