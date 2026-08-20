/** Rutas de la pasarela de pago. */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { PaymentsController } from './payments.controller.js';
import { PspController } from './psp/psp.controller.js';
import { requireAdmin } from './admin.middleware.js';
import type { RawBodyRequest } from '../webhook/webhook.controller.js';

// Envuelve handlers async para propagar errores al manejador central.
const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const paymentsRouter = Router();

// Registro de pago (checkout / bot).
paymentsRouter.post('/', wrap(PaymentsController.registrar));

// Webhook del PSP (cobro automático). La firma se valida dentro del servicio.
paymentsRouter.post('/webhook/:proveedor', wrap((req, res) => PspController.recibir(req as RawBodyRequest, res)));

// Administración (requiere Bearer ADMIN_API_TOKEN).
paymentsRouter.get('/pendientes', requireAdmin, wrap(PaymentsController.pendientes));
paymentsRouter.post('/:id/confirmar', requireAdmin, wrap(PaymentsController.confirmar));
paymentsRouter.post('/:id/rechazar', requireAdmin, wrap(PaymentsController.rechazar));
