/**
 * Rutas transaccionales (Fase 2b), montadas en /api:
 *   Pedidos:
 *     POST /api/pedidos                    (cliente) crear pedido
 *     GET  /api/pedidos/mios               (cliente) mis pedidos
 *     GET  /api/pedidos                    (admin)   todos (?estado=)
 *     POST /api/pedidos/:id/estado         (admin)   cambiar estado
 *   Billetera:
 *     GET  /api/wallet                     (cliente) saldo + movimientos
 *     POST /api/wallet/recargas            (cliente) solicitar recarga
 *     GET  /api/wallet/recargas/mias       (cliente) mis recargas
 *     GET  /api/wallet/recargas            (admin)   recargas pendientes
 *     POST /api/wallet/recargas/:id/aprobar   (admin) aprobar (acredita saldo)
 *     POST /api/wallet/recargas/:id/rechazar  (admin) rechazar
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { OrdersController } from './orders.controller.js';
import { WalletController } from './wallet.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const admin = [requireAuth, requireRol('admin')];

export const commerceRouter = Router();

// ── Pedidos ──
commerceRouter.post('/pedidos', requireAuth, wrap(OrdersController.crear));
commerceRouter.get('/pedidos/mios', requireAuth, wrap(OrdersController.mios));
commerceRouter.get('/pedidos', ...admin, wrap(OrdersController.listar));
commerceRouter.post('/pedidos/:id/estado', ...admin, wrap(OrdersController.cambiarEstado));

// ── Billetera ──
commerceRouter.get('/wallet', requireAuth, wrap(WalletController.resumen));
commerceRouter.post('/wallet/recargas', requireAuth, wrap(WalletController.solicitarRecarga));
commerceRouter.get('/wallet/recargas/mias', requireAuth, wrap(WalletController.misRecargas));
commerceRouter.post('/wallet/transferir', requireAuth, wrap(WalletController.transferir));
commerceRouter.get('/wallet/recargas', ...admin, wrap(WalletController.pendientes));
commerceRouter.post('/wallet/recargas/:id/aprobar', ...admin, wrap(WalletController.aprobar));
commerceRouter.post('/wallet/recargas/:id/rechazar', ...admin, wrap(WalletController.rechazar));
