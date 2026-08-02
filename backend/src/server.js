const { config, validateConfig } = require('./config');
const { seedAdministrator } = require('./database');
const { createApp } = require('./app');
validateConfig();
let server;
async function start(){await seedAdministrator();server=createApp().listen(config.port,config.host,()=>console.log(`PDV Manaaim disponível em http://${config.host}:${config.port}`));}
start().catch(error=>{console.error('Falha ao iniciar o servidor:',error);process.exit(1);});
function shutdown(signal){console.log(`${signal} recebido. Encerrando servidor...`);if(!server)return process.exit(0);server.close(()=>process.exit(0));}
process.on('SIGINT',()=>shutdown('SIGINT'));process.on('SIGTERM',()=>shutdown('SIGTERM'));
