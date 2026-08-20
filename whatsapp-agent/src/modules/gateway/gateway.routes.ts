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

export const gatewayRouter = Router();

gatewayRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

// Perfil real o estado Guest (nunca inventa un perfil).
gatewayRouter.get('/user/profile', wrap(async (req, res) => {
  const userId = req.query.userId ? String(req.query.userId) : '';
  if (!userId) { res.json({ ok: true, autenticado: false, guest: true, perfil: null }); return; }
  const u = await UsersRepository.findByWhatsapp(userId).catch(() => null);
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
      id_whatsapp: u.id_whatsapp,
      servicios_activos: subs.length,
    },
  });
}));
