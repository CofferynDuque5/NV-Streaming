/**
 * async-handler.ts — Envoltorio único para controladores asíncronos.
 *
 * Elimina el `wrap = (fn) => (req,res,next) => fn().catch(next)` duplicado en
 * los 12 archivos de rutas (DRY). Cualquier error lanzado por el controlador se
 * delega al manejador central de errores; el controlador solo se ocupa de su
 * caso de éxito (SRP).
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export type ControladorAsync = (req: Request, res: Response) => Promise<void>;

export function asyncHandler(controlador: ControladorAsync): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    controlador(req, res).catch(next);
  };
}
