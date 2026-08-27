/**
 * Rutas del panel de revendedor, montadas en /api (todas requieren sesión):
 *   GET  /api/reseller/overview       resumen: código, KPIs y cubos de comisión
 *   GET  /api/reseller/clients        CRM: clientes referidos (datos reales)
 *   GET  /api/reseller/commissions    libro de comisiones
 *   POST /api/reseller/withdraw       retira comisiones disponibles → billetera
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { ResellerController } from './reseller.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const resellerRouter = Router();

resellerRouter.get('/reseller/overview', requireAuth, wrap(ResellerController.overview));
resellerRouter.get('/reseller/clients', requireAuth, wrap(ResellerController.clients));
resellerRouter.get('/reseller/commissions', requireAuth, wrap(ResellerController.commissions));
resellerRouter.post('/reseller/withdraw', requireAuth, wrap(ResellerController.withdraw));
