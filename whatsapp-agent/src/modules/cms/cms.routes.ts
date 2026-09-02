/**
 * Rutas del CMS (montadas en /api):
 *   GET    /api/cms/:coleccion         → lista de documentos (pública si es contenido de tienda)
 *   GET    /api/cms/:coleccion/:id      → un documento
 *   PUT    /api/cms/:coleccion/:id      → crear/actualizar (solo admin)
 *   DELETE /api/cms/:coleccion/:id      → borrar (solo admin)
 */
import { Router } from 'express';
import { CmsController } from './cms.controller.js';
import { optionalAuth, requireAuth, requireRol } from '../auth/auth.middleware.js';
import { asyncHandler } from '../../core/async-handler.js';

export const cmsRouter = Router();

// Lectura: optionalAuth (público para contenido de tienda; el controlador exige
// sesión en colecciones no públicas).
cmsRouter.get('/cms/:coleccion', optionalAuth, asyncHandler(CmsController.listar));
cmsRouter.get('/cms/:coleccion/:id', optionalAuth, asyncHandler(CmsController.obtener));

// Escritura: solo admin.
cmsRouter.put('/cms/:coleccion/:id', requireAuth, requireRol('admin'), asyncHandler(CmsController.upsert));
cmsRouter.delete('/cms/:coleccion/:id', requireAuth, requireRol('admin'), asyncHandler(CmsController.borrar));
