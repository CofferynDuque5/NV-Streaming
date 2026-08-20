/** Punto de entrada: arranca el servidor HTTP y gestiona el apagado ordenado. */
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './server.js';
import { closePool } from './db/pool.js';
import { startCron, stopCron } from './cron/scheduler.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 NV Stream · agente WhatsApp escuchando en http://localhost:${env.PORT}`);
  logger.info(`   Webhook: POST/GET /webhook/whatsapp  ·  Health: GET /health`);
});

// Tareas programadas (node-cron): aviso de vencimiento diario + renovaciones.
// Desactivable con CRON_ENABLED=off; alternativamente usar los CLI job:*.
startCron();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Apagando…');
  stopCron();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Salvavidas si algo se cuelga.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
