/**
 * Rutas de inventario (montadas en /api, solo admin):
 *   Cuentas (stock):
 *     GET    /api/admin/cuentas            (?plataforma=)
 *     GET    /api/admin/cuentas/resumen    stock por plataforma/estado
 *     POST   /api/admin/cuentas
 *     PUT    /api/admin/cuentas/:id
 *     DELETE /api/admin/cuentas/:id
 *   Planes:
 *     GET    /api/admin/planes
 *     POST   /api/admin/planes
 *     PUT    /api/admin/planes/:id
 *     DELETE /api/admin/planes/:id
 *   Cola de espera:
 *     GET    /api/admin/cola-espera
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { InventoryController } from './inventory.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const admin = [requireAuth, requireRol('admin')];

export const inventoryRouter = Router();

// Cuentas
inventoryRouter.get('/admin/cuentas/resumen', ...admin, wrap(InventoryController.resumenStock));
inventoryRouter.get('/admin/cuentas', ...admin, wrap(InventoryController.listarCuentas));
inventoryRouter.post('/admin/cuentas', ...admin, wrap(InventoryController.crearCuenta));
inventoryRouter.put('/admin/cuentas/:id', ...admin, wrap(InventoryController.actualizarCuenta));
inventoryRouter.delete('/admin/cuentas/:id', ...admin, wrap(InventoryController.eliminarCuenta));

// Planes
inventoryRouter.get('/admin/planes', ...admin, wrap(InventoryController.listarPlanes));
inventoryRouter.post('/admin/planes', ...admin, wrap(InventoryController.crearPlan));
inventoryRouter.put('/admin/planes/:id', ...admin, wrap(InventoryController.actualizarPlan));
inventoryRouter.delete('/admin/planes/:id', ...admin, wrap(InventoryController.eliminarPlan));

// Cola de espera
inventoryRouter.get('/admin/cola-espera', ...admin, wrap(InventoryController.colaEspera));
