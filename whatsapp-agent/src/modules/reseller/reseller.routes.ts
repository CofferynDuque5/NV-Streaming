/**
 * Rutas del panel de revendedor, montadas en /api (todas requieren sesión):
 *   GET  /api/reseller/overview       resumen: código, KPIs y cubos de comisión
 *   GET  /api/reseller/clients        CRM: clientes referidos (datos reales)
 *   GET  /api/reseller/commissions    libro de comisiones
 *   POST /api/reseller/withdraw       retira comisiones disponibles → billetera
 */
import { Router } from 'express';
import { ResellerController, esquemaRetiro } from './reseller.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../../core/async-handler.js';
import { validate } from '../../core/validate.js';

export const resellerRouter = Router();

resellerRouter.get('/reseller/overview', requireAuth, asyncHandler(ResellerController.overview));
resellerRouter.get('/reseller/clients', requireAuth, asyncHandler(ResellerController.clients));
resellerRouter.get('/reseller/commissions', requireAuth, asyncHandler(ResellerController.commissions));
resellerRouter.post('/reseller/withdraw', requireAuth, validate(esquemaRetiro), asyncHandler(ResellerController.withdraw));
