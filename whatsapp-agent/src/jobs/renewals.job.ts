/**
 * renewals.job.ts — Ejecuta UN ciclo de renovaciones y termina. Pensado para
 * cron externo:  0 * /6 * * *  →  npm run job:renewals
 */
import { logger } from '../utils/logger.js';
import { runRenewalCycle } from '../modules/renewals/renewals.service.js';
import { closePool } from '../db/pool.js';

const dias = Number(process.argv[2] ?? 3);

runRenewalCycle(Number.isFinite(dias) ? dias : 3)
  .then((r) => logger.info(r, 'Job de renovaciones finalizado'))
  .catch((err) => { logger.error({ err }, 'Job de renovaciones falló'); process.exitCode = 1; })
  .finally(() => closePool());
