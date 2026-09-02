/**
 * Rutas de autenticación web (montadas en /api/auth):
 *   POST /api/auth/register  { email, password, nombre? } → { usuario, token }
 *   POST /api/auth/login     { email, password }          → { usuario, token }
 *   GET  /api/auth/me        (Bearer token)               → { usuario }
 *   POST /api/auth/logout                                 → { ok } (el cliente descarta el token)
 */
import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { asyncHandler } from '../../core/async-handler.js';
import { rateLimit } from '../../core/rate-limit.js';

export const authRouter = Router();

// Freno anti-fuerza-bruta: como máximo 10 intentos por IP cada 5 min sobre los
// endpoints con credenciales (registro/login). Devuelve 429 con Retry-After.
const limiteCredenciales = rateLimit({ windowMs: 5 * 60_000, max: 10 });

authRouter.post('/auth/register', limiteCredenciales, asyncHandler(AuthController.register));
authRouter.post('/auth/login', limiteCredenciales, asyncHandler(AuthController.login));
authRouter.get('/auth/me', requireAuth, asyncHandler(AuthController.me));
authRouter.post('/auth/logout', (_req, res) => { res.json({ ok: true }); });
