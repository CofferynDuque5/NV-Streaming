/**
 * Rutas del panel de administración (montadas en /api, solo admin):
 *   GET /api/admin/overview → KPIs, conteos por módulo, roles y actividad reales.
 */
import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';
import { asyncHandler } from '../../core/async-handler.js';

export const adminRouter = Router();

adminRouter.get('/admin/overview', requireAuth, requireRol('admin'), asyncHandler(AdminController.overview));
adminRouter.get('/admin/datos', requireAuth, requireRol('admin'), asyncHandler(AdminController.tablas));
adminRouter.get('/admin/revendedores', requireAuth, requireRol('admin'), asyncHandler(AdminController.revendedores));
adminRouter.put('/admin/usuarios/:id', requireAuth, requireRol('admin'), asyncHandler(AdminController.actualizarUsuario));
// Bandeja de notificaciones (alertas_admin): listar + marcar leídas.
adminRouter.get('/admin/alertas', requireAuth, requireRol('admin'), asyncHandler(AdminController.alertas));
adminRouter.post('/admin/alertas/leer-todas', requireAuth, requireRol('admin'), asyncHandler(AdminController.marcarTodasAlertasLeidas));
adminRouter.post('/admin/alertas/:id/leida', requireAuth, requireRol('admin'), asyncHandler(AdminController.marcarAlertaLeida));
