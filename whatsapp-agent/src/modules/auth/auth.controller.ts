/**
 * Controlador de auth: traduce HTTP ↔ servicio.
 *
 * No maneja errores localmente: `AuthError` extiende `AppError`, así que
 * cualquier fallo (email en uso, credenciales, etc.) se propaga al manejador
 * central (`errorHandler`), que ya conoce su `statusCode` y cuerpo seguro. Las
 * rutas envuelven estos métodos con `asyncHandler` para capturar la promesa.
 */
import type { Request, Response } from 'express';
import * as Auth from './auth.service.js';
import { UnauthorizedError, NotFoundError } from '../../core/errors.js';
import type { AuthedRequest } from './auth.middleware.js';

export const AuthController = {
  async register(req: Request, res: Response): Promise<void> {
    res.status(201).json(await Auth.register(req.body || {}));
  },

  async login(req: Request, res: Response): Promise<void> {
    res.json(await Auth.login(req.body || {}));
  },

  async me(req: Request, res: Response): Promise<void> {
    const payload = (req as AuthedRequest).user;
    if (!payload) throw new UnauthorizedError('No autenticado.');
    const sesion = await Auth.sesionDeId(payload.sub);
    if (!sesion) throw new NotFoundError('Usuario no encontrado.');
    res.json({ usuario: sesion });
  },
};
