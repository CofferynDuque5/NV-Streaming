/**
 * Rutas de autenticación web (montadas en /api/auth):
 *   POST /api/auth/register  { email, password, nombre? } → { usuario, token }
 *   POST /api/auth/login     { email, password }          → { usuario, token }
 *   GET  /api/auth/me        (Bearer token)               → { usuario }
 *   POST /api/auth/logout                                 → { ok } (el cliente descarta el token)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const authRouter = Router();

authRouter.post('/auth/register', wrap(AuthController.register));
authRouter.post('/auth/login', wrap(AuthController.login));
authRouter.get('/auth/me', requireAuth, wrap(AuthController.me));
authRouter.post('/auth/logout', (_req, res) => { res.json({ ok: true }); });
