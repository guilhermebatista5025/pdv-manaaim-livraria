const path = require('node:path');
require('dotenv').config();

const rootDir = path.resolve(__dirname, '..', '..');

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: positiveInteger(process.env.PORT, 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || 'backend/database/livraria.db'),
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionMaxAgeHours: positiveInteger(process.env.SESSION_MAX_AGE_HOURS, 12),
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
    password: process.env.ADMIN_PASSWORD || ''
  }
};

function validateConfig() {
  if (config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres.');
  }

  if (config.env === 'production' && config.sessionSecret.includes('troque-')) {
    throw new Error('Defina um SESSION_SECRET seguro antes de usar em produção.');
  }
}

module.exports = { config, validateConfig };

