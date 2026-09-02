/**
 * gateway.routes.ts — API Gateway de configuración y perfil para la web.
 *
 *   GET /api/config         → parámetros canónicos (tasa_bcv viva) + tema.
 *   GET /api/user/profile   → perfil real del usuario (Postgres) o estado Guest.
 *
 * Nota de arquitectura: el saldo de billetera y el rol viven en Firestore
 * (dominio web); aquí se expone lo que gobierna el agente (identidad + suscripciones).
 * CORS abierto para lectura desde la web estática.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { PARAMETROS, TEMA_INTERFAZ, PLANTILLAS_MENSAJES } from '../../config/platform-config.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { SubscriptionsRepository } from '../../db/repositories/subscriptions.repo.js';
import { optionalAuth, type AuthedRequest } from '../auth/auth.middleware.js';

export const gatewayRouter = Router();

gatewayRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

// Configuración canónica (la web lee `parametros.tasa_bcv` para el conversor).
gatewayRouter.get('/config', (_req, res) => {
  res.json({
    ok: true,
    configuracion_sistema: {
      parametros: PARAMETROS,
      tema_interfaz: TEMA_INTERFAZ,
      plantillas_mensajes: PLANTILLAS_MENSAJES,
    },
  });
});

// Perfil real o estado Guest. La identidad SIEMPRE sale del JWT (optionalAuth):
// se acabó el `?userId=<teléfono>` que permitía leer el perfil de cualquiera.
gatewayRouter.get('/user/profile', optionalAuth, wrap(async (req, res) => {
  const sub = (req as AuthedRequest).user?.sub;
  if (!sub) { res.json({ ok: true, autenticado: false, guest: true, perfil: null }); return; }
  const u = await UsersRepository.findById(sub).catch(() => null);
  if (!u) { res.json({ ok: true, autenticado: false, guest: true, perfil: null }); return; }
  const subs = await SubscriptionsRepository.findActiveDetailedByUser(u.id).catch(() => []);
  res.json({
    ok: true,
    autenticado: true,
    guest: false,
    perfil: {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      servicios_activos: subs.length,
    },
  });
}));
