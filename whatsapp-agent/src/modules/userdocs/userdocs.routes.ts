/**
 * Rutas de documentos por usuario (montadas en /api):
 *   GET  /api/mis/:coleccion              (cliente) mis documentos
 *   POST /api/mis/:coleccion              (cliente) crear (solo tickets/chats)
 *   GET  /api/admin/docs/:coleccion       (admin)   todos
 *   PUT  /api/admin/docs/:coleccion/:id   (admin)   crear/actualizar (asignar dueño, responder…)
 *   DELETE /api/admin/docs/:coleccion/:id (admin)   borrar
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { UserDocsController } from './userdocs.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const admin = [requireAuth, requireRol('admin')];

export const userdocsRouter = Router();

userdocsRouter.get('/mis/:coleccion', requireAuth, wrap(UserDocsController.mios));
userdocsRouter.post('/mis/:coleccion', requireAuth, wrap(UserDocsController.crear));
userdocsRouter.get('/admin/docs/:coleccion', ...admin, wrap(UserDocsController.todos));
userdocsRouter.get('/admin/docs/:coleccion/:id', ...admin, wrap(UserDocsController.obtener));
userdocsRouter.put('/admin/docs/:coleccion/:id', ...admin, wrap(UserDocsController.upsert));
userdocsRouter.delete('/admin/docs/:coleccion/:id', ...admin, wrap(UserDocsController.borrar));
