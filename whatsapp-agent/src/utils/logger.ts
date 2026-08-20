/** Logger estructurado (pino). Único punto de logging del servicio. */
import pino, { type LoggerOptions } from 'pino';
import pretty from 'pino-pretty';
import { env, isProd } from '../config/env.js';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    // Nunca registrar secretos ni credenciales, aunque lleguen en un objeto.
    paths: ['req.headers.authorization', 'req.headers["x-hub-signature-256"]', '*.contrasena', '*.access_token'],
    censor: '[oculto]',
  },
};

// En desarrollo, salida legible mediante un STREAM de pino-pretty (evita el
// transport por worker, que falla al resolverse bajo tsx/ESM). En producción,
// JSON plano para agregadores de logs.
export const logger =
  !isProd && env.LOG_LEVEL !== 'silent'
    ? pino(options, pretty({ colorize: true, translateTime: 'SYS:HH:MM:ss' }))
    : pino(options);
