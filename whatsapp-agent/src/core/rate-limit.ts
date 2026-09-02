/**
 * rate-limit.ts — Límite de tasa por ventana fija (resiliencia anti-abuso).
 *
 * Implementación EN MEMORIA sin dependencias: cuenta peticiones por clave (IP por
 * defecto) dentro de una ventana. Ideal para proteger login/registro/chat de
 * fuerza bruta y ráfagas. Nota de escalado: es por-instancia; para varias
 * réplicas, inyectar un almacén compartido (Redis) respetando la misma interfaz.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { TooManyRequestsError } from './errors.js';

interface Contador { conteo: number; expira: number; }

export interface OpcionesRateLimit {
  windowMs: number;
  max: number;
  clave?: (req: Request) => string;
}

const almacen = new Map<string, Contador>();

// Barrido periódico de claves expiradas (evita crecimiento no acotado).
const barrido = setInterval(() => {
  const ahora = Date.now();
  for (const [clave, contador] of almacen) if (contador.expira <= ahora) almacen.delete(clave);
}, 60_000);
barrido.unref?.();

function clavePorDefecto(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'desconocido';
}

export function rateLimit(opciones: OpcionesRateLimit): RequestHandler {
  const obtenerClave = opciones.clave ?? clavePorDefecto;
  return (req: Request, res: Response, next: NextFunction): void => {
    const ahora = Date.now();
    const clave = `${req.path}:${obtenerClave(req)}`;
    const contador = almacen.get(clave);

    if (!contador || contador.expira <= ahora) {
      almacen.set(clave, { conteo: 1, expira: ahora + opciones.windowMs });
      next();
      return;
    }
    contador.conteo += 1;
    if (contador.conteo > opciones.max) {
      res.setHeader('Retry-After', String(Math.ceil((contador.expira - ahora) / 1000)));
      next(new TooManyRequestsError());
      return;
    }
    next();
  };
}
