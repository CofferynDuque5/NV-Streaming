/** Middleware de autenticación: exige un JWT válido en `Authorization: Bearer`. */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from './auth.service.js';

export interface AuthedRequest extends Request { user?: TokenPayload }

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'no_autenticado' }); return; }
  try {
    (req as AuthedRequest).user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'token_invalido' });
  }
}

/** Igual que requireAuth pero no bloquea: si hay token válido, adjunta el usuario. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (token) { try { (req as AuthedRequest).user = verifyToken(token); } catch { /* invitado */ } }
  next();
}

/** Exige que el usuario autenticado tenga uno de los roles indicados. */
export function requireRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const u = (req as AuthedRequest).user;
    if (!u) { res.status(401).json({ error: 'no_autenticado' }); return; }
    if (!roles.includes(u.rol)) { res.status(403).json({ error: 'no_autorizado' }); return; }
    next();
  };
}
