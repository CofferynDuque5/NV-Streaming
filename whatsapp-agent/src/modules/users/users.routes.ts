/** Rutas de usuarios. */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { UsersController } from './users.controller.js';
import { requireAdmin } from '../payments/admin.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const usersRouter = Router();

// Protegido: solo un llamador de confianza (Cloud Function / backend) con el
// ADMIN_API_TOKEN puede disparar el correo de bienvenida.
usersRouter.post('/bienvenida', requireAdmin, wrap(UsersController.bienvenida));
