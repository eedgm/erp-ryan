require('dotenv').config();

const mask = (value) => {
  if (!value) return '(missing)';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const databaseUrl = process.env.DATABASE_URL;

let parsed = null;
if (databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    parsed = {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, ''),
      user: url.username || '(missing)'
    };
  } catch {
    parsed = { error: 'DATABASE_URL invalido o no parseable' };
  }
}

console.log(JSON.stringify({
  NODE_ENV: process.env.NODE_ENV || '(missing)',
  PORT: process.env.PORT || '(missing)',
  DATABASE_URL: databaseUrl ? mask(databaseUrl) : '(missing)',
  parsedDatabaseUrl: parsed,
  DB_HOST: process.env.DB_HOST || '(missing)',
  DB_PORT: process.env.DB_PORT || '(missing)',
  DB_NAME: process.env.DB_NAME || '(missing)',
  DB_USER: process.env.DB_USER || '(missing)',
  DB_PASSWORD: process.env.DB_PASSWORD ? '********' : '(missing)',
  FRONTEND_URL: process.env.FRONTEND_URL || '(missing)',
  JWT_SECRET: process.env.JWT_SECRET ? '********' : '(missing)'
}, null, 2));
