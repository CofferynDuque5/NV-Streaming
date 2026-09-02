/**
 * request-context.ts — Correlación de peticiones y timeout de respuesta.
 *
 *  · requestId: asigna/propaga un id por petición (cabecera X-Request-Id) para
 *    trazar el ciclo completo en los logs estructurados.
 *  · requestTimeout: corta las peticiones que superan un presupuesto de tiempo
 *    (evita conexiones colgadas que agotan el pool). Resiliencia.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { TimeoutError } from './errors.js';

// `id` ya viene declarada en Express Request (augmentación de pino-http);
// reexponemos el tipo para los llamadores que solo necesitan leerla.
export type RequestConId = Request & { id: string };

const CABECERA_ID = 'x-request-id';

export function requestId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const entrante = req.headers[CABECERA_ID];
    const id = (Array.isArray(entrante) ? entrante[0] : entrante) || randomUUID();
    (req as RequestConId).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

/** Aborta con 503 las peticiones que exceden `ms` sin haber respondido. */
export function requestTimeout(ms: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const temporizador = setTimeout(() => {
      if (!res.headersSent) next(new TimeoutError());
    }, ms);
    temporizador.unref?.();
    res.on('finish', () => clearTimeout(temporizador));
    res.on('close', () => clearTimeout(temporizador));
    next();
  };
}
