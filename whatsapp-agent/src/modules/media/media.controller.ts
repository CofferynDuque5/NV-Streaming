/**
 * media.controller.ts — Biblioteca de medios del panel (solo admin).
 *
 *   GET    /api/admin/medios        → { configurado, medios: [...] }
 *   POST   /api/admin/medios        → sube a ImgBB (clave del servidor) y registra
 *   DELETE /api/admin/medios/:id    → quita de la biblioteca (devuelve delete_url
 *                                     de ImgBB para que el operador borre allí)
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { MediaRepository } from '../../db/repositories/media.repo.js';
import { mediaService } from './media.service.js';
import { NotFoundError, ValidationError } from '../../core/errors.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

const USOS = ['general', 'logo', 'servicio', 'combo', 'banner', 'cartelera', 'otro'] as const;

const SubirSchema = z.object({
  imagen: z.string().min(8, 'Falta la imagen.'),
  nombre: z.string().trim().min(1).max(160).default('imagen'),
  uso: z.enum(USOS).default('general'),
});

export const MediaController = {
  async listar(_req: Request, res: Response): Promise<void> {
    const medios = await MediaRepository.listar();
    res.json({ configurado: mediaService.configurado, medios });
  },

  async subir(req: Request, res: Response): Promise<void> {
    const parsed = SubirSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Datos de subida inválidos.', parsed.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })));
    }
    const { imagen, nombre, uso } = parsed.data;
    const r = await mediaService.subir(imagen, nombre);
    const uid = (req as AuthedRequest).user?.sub ?? null;
    const medio = await MediaRepository.crear({ nombre, uso, subido_por: uid, ...r });
    res.status(201).json({ medio });
  },

  async borrar(req: Request, res: Response): Promise<void> {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Id de medio inválido.');
    const medio = await MediaRepository.borrar(id);
    if (!medio) throw new NotFoundError('Medio no encontrado.');
    res.json({
      ok: true,
      medio,
      // ImgBB no expone borrado por API: el archivo sigue en ImgBB hasta que el
      // operador lo borre desde su delete_url (o desde su cuenta de ImgBB).
      delete_url: medio.delete_url,
      nota: 'Quitado de la biblioteca. Para borrarlo también en ImgBB abre delete_url.',
    });
  },
};
