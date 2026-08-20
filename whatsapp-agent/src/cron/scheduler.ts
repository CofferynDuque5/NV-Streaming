/**
 * scheduler.ts — Tareas programadas con node-cron.
 *
 * Registra:
 *   · Aviso de vencimiento a EXACTAMENTE N días (Template Message) — a diario.
 *   · Ciclo de renovaciones/vencimientos — cada 6 h (Paso 3).
 *
 * Expresiones y zona horaria configurables por entorno. Para runners externos
 * (cron del sistema / Cloud Scheduler) usar los CLI `job:expiry-reminders` y
 * `job:renewals` en vez de este scheduler in-process.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { runExpiryReminders } from '../modules/reminders/expiry-reminder.service.js';
import { runRenewalCycle } from '../modules/renewals/renewals.service.js';

const tasks: ScheduledTask[] = [];

export function startCron(): void {
  if (env.CRON_ENABLED === 'off') { logger.info('Cron deshabilitado (CRON_ENABLED=off)'); return; }

  const tz = env.CRON_TZ;

  // Aviso diario de vencimiento a exactamente N días.
  tasks.push(
    cron.schedule(env.CRON_EXPIRY_REMINDER, () => {
      runExpiryReminders(env.REMINDER_DIAS_ANTES).catch((err) => logger.error({ err }, 'Fallo en avisos de vencimiento'));
    }, { timezone: tz }),
  );

  // Renovaciones/vencimientos cada 6 h.
  tasks.push(
    cron.schedule(env.CRON_RENEWALS, () => {
      runRenewalCycle().catch((err) => logger.error({ err }, 'Fallo en el ciclo de renovaciones'));
    }, { timezone: tz }),
  );

  logger.info({ tz, aviso: env.CRON_EXPIRY_REMINDER, renovaciones: env.CRON_RENEWALS, dias: env.REMINDER_DIAS_ANTES }, 'Cron iniciado');
}

export function stopCron(): void {
  while (tasks.length) tasks.pop()?.stop();
}
