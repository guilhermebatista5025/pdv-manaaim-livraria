const { config, validateConfig } = require('./config');
const { seedAdministrator } = require('./database');
const { createApp } = require('./app');

validateConfig();
seedAdministrator();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`PDV Manaaim disponível em http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando servidor...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

