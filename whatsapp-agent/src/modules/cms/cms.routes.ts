/**
 * Rutas del CMS (montadas en /api):
 *   GET    /api/cms/:coleccion         → lista de documentos (pública si es contenido de tienda)
 *   GET    /api/cms/:coleccion/:id      → un documento
 *   PUT    /api/cms/:coleccion/:id      → crear/actualizar (solo admin)
 *   DELETE /api/cms/:coleccion/:id      → borrar (solo admin)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { CmsController } from './cms.controller.js';
import { optionalAuth, requireAuth, requireRol } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const cmsRouter = Router();

// Lectura: optionalAuth (público para contenido de tienda; el controlador exige
// sesión en colecciones no públicas).
cmsRouter.get('/cms/:coleccion', optionalAuth, wrap(CmsController.listar));
cmsRouter.get('/cms/:coleccion/:id', optionalAuth, wrap(CmsController.obtener));

// Escritura: solo admin.
cmsRouter.put('/cms/:coleccion/:id', requireAuth, requireRol('admin'), wrap(CmsController.upsert));
cmsRouter.delete('/cms/:coleccion/:id', requireAuth, requireRol('admin'), wrap(CmsController.borrar));
