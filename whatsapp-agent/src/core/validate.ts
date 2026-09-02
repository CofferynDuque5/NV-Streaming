/**
 * validate.ts — Middleware de validación riguroso con Zod.
 *
 * Valida y SANEA la entrada antes de llegar al controlador. Si falla, lanza el
 * `ZodError` que el manejador central convierte en 400 con los campos exactos.
 * Para `body` reemplaza el contenido por la versión ya tipada/saneada.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

export type FuenteValidacion = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, fuente: FuenteValidacion = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const resultado = schema.safeParse(req[fuente]);
    if (!resultado.success) { next(resultado.error); return; }
    if (fuente === 'body') req.body = resultado.data;   // datos saneados aguas abajo
    next();
  };
}
