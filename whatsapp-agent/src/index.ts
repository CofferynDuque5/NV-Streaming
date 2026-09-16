/** Punto de entrada: arranca el servidor HTTP y gestiona el apagado ordenado. */
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './server.js';
import { closePool, esperarConexion } from './db/pool.js';
import { startCron, stopCron } from './cron/scheduler.js';

async function main(): Promise<void> {
  // No aceptamos tráfico hasta confirmar que Postgres responde (reintentos con
  // backoff). Evita servir 500 durante el arranque si la BD tarda en levantar.
  await esperarConexion();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 NV Stream · agente WhatsApp escuchando en http://localhost:${env.PORT}`);
    logger.info(`   Webhook: POST/GET /webhook/whatsapp  ·  Health: GET /health`);
  });

  // Tareas programadas (node-cron): aviso de vencimiento diario + renovaciones.
  // Desactivable con CRON_ENABLED=off; alternativamente usar los CLI job:*.
  startCron();

  registrarApagado(server);
}

/** Apagado ordenado: detiene cron, cierra el servidor HTTP y el pool de BD. */
function registrarApagado(server: import('node:http').Server): void {
  const apagar = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Apagando…');
    stopCron();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Salvavidas si algo se cuelga.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void apagar('SIGINT'));
  process.on('SIGTERM', () => void apagar('SIGTERM'));
}

// Un error asíncrono sin capturar (p.ej. una notificación en segundo plano que
// falla) NO debe tumbar el servidor: se registra y el proceso sigue sirviendo.
process.on('unhandledRejection', (razon) => {
  logger.error({ err: razon }, 'Promesa rechazada sin capturar (el servidor sigue en pie)');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Excepción no capturada (el servidor sigue en pie)');
});

main().catch((err) => {
  logger.error({ err }, 'Fallo fatal en el arranque');
  process.exit(1);
});
