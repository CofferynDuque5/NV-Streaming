/**
 * error-handler.ts — Manejo global de errores (un solo lugar).
 *
 * Traduce cualquier error a una respuesta HTTP consistente:
 *   · AppError  → su statusCode + cuerpo seguro (código, mensaje, detalles).
 *   · ZodError  → 400 con los campos inválidos.
 *   · Otro      → 500 genérico (no filtra detalles internos) + log completo.
 * El id de petición viaja en la respuesta y en el log para trazabilidad.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { AppError, esAppError, NotFoundError, ValidationError, type DetalleError } from './errors.js';
import type { RequestConId } from './request-context.js';

function detallesDeZod(error: ZodError): DetalleError[] {
  return error.issues.map((incidencia) => {
    const campo = incidencia.path.join('.');
    return campo ? { campo, mensaje: incidencia.message } : { mensaje: incidencia.message };
  });
}

function normalizar(error: unknown): AppError {
  if (esAppError(error)) return error;
  if (error instanceof ZodError) return new ValidationError('Datos de entrada inválidos.', detallesDeZod(error));
  return new AppError({ code: 'error_interno', message: 'Ocurrió un error interno.', statusCode: 500, causa: error });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json(new NotFoundError('Ruta no encontrada.').toJSON());
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = normalizar(err);
  const reqId = (req as RequestConId).id;

  if (appError.statusCode >= 500) {
    logger.error({ err: appError.causa ?? err, reqId, code: appError.code }, 'Error no controlado');
  } else {
    logger.warn({ reqId, code: appError.code, status: appError.statusCode }, 'Error de petición');
  }

  if (res.headersSent) return;
  res.status(appError.statusCode).json(appError.toJSON());
}
