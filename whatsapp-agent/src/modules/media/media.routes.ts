/**
 * Rutas de la biblioteca de medios (montadas en /api, solo admin).
 */
import { Router } from 'express';
import { MediaController } from './media.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';
import { asyncHandler } from '../../core/async-handler.js';

export const mediaRouter = Router();
const admin = [requireAuth, requireRol('admin')];

mediaRouter.get('/admin/medios', ...admin, asyncHandler(MediaController.listar));
mediaRouter.post('/admin/medios', ...admin, asyncHandler(MediaController.subir));
mediaRouter.delete('/admin/medios/:id', ...admin, asyncHandler(MediaController.borrar));
