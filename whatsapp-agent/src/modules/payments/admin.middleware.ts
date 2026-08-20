/**
 * Middleware de autorización para endpoints administrativos de pagos.
 * Exige `Authorization: Bearer <ADMIN_API_TOKEN>`. Si el token no está
 * configurado, deniega por defecto (seguro por diseño).
 */
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!env.ADMIN_API_TOKEN) {
    logger.warn('ADMIN_API_TOKEN no configurado: endpoint administrativo denegado');
    res.status(503).json({ error: 'admin_api_deshabilitada' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(env.ADMIN_API_TOKEN);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) { next(); return; }
  res.status(401).json({ error: 'no_autorizado' });
}
