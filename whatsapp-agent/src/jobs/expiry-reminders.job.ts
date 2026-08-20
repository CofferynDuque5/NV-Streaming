/**
 * expiry-reminders.job.ts — Ejecuta UNA corrida del aviso de vencimiento a
 * exactamente N días y termina. Para cron externo:
 *   0 9 * * *  →  npm run job:expiry-reminders
 * Opcional: `npm run job:expiry-reminders 5` para avisar a 5 días.
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { runExpiryReminders } from '../modules/reminders/expiry-reminder.service.js';
import { closePool } from '../db/pool.js';

const dias = Number(process.argv[2] ?? env.REMINDER_DIAS_ANTES);

runExpiryReminders(Number.isFinite(dias) ? dias : env.REMINDER_DIAS_ANTES)
  .then((r) => logger.info(r, 'Job de avisos de vencimiento finalizado'))
  .catch((err) => { logger.error({ err }, 'Job de avisos falló'); process.exitCode = 1; })
  .finally(() => closePool());
