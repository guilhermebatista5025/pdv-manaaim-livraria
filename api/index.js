const { validateConfig } = require('../backend/src/config');
const { seedAdministrator } = require('../backend/src/database');
const { createApp } = require('../backend/src/app');

validateConfig();
const app = createApp();
const ready = seedAdministrator();

module.exports = async function handler(req, res) {
  try {
    await ready;
    return app(req, res);
  } catch (error) {
    console.error('Falha ao inicializar a API:', error);
    return res.status(500).json({ error: 'API indisponível.' });
  }
};
