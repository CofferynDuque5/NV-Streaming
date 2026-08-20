/**
 * Documentos por usuario: suscripciones, tickets/chats de soporte, notificaciones.
 * Cliente ve/crea los suyos; admin gestiona todos. Lista blanca de colecciones.
 */
import type { Request, Response } from 'express';
import { UserDocsRepository } from '../../db/repositories/userdocs.repo.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

export const COLECCIONES_USUARIO = new Set<string>([
  'suscripciones', 'tickets_soporte', 'chats_soporte', 'notificaciones',
]);

// El cliente solo puede CREAR en colecciones donde tiene sentido abrir algo.
const CREABLES_POR_CLIENTE = new Set<string>(['tickets_soporte', 'chats_soporte']);

function valida(c: string, res: Response): boolean {
  if (!COLECCIONES_USUARIO.has(c)) { res.status(404).json({ error: 'coleccion_desconocida' }); return false; }
  return true;
}

export const UserDocsController = {
  // Cliente: sus documentos de la colección.
  async mios(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    const uid = (req as AuthedRequest).user!.sub;
    res.json({ coleccion: c, documentos: await UserDocsRepository.mios(c, uid) });
  },

  // Cliente: crea un documento propio (p.ej. abrir ticket de soporte).
  async crear(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    if (!CREABLES_POR_CLIENTE.has(c)) { res.status(403).json({ error: 'no_permitido' }); return; }
    const uid = (req as AuthedRequest).user!.sub;
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    res.status(201).json(await UserDocsRepository.crear(c, uid, body));
  },

  // Admin: todos los documentos de la colección.
  async todos(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    res.json({ coleccion: c, documentos: await UserDocsRepository.todos(c) });
  },

  // Admin: un documento concreto.
  async obtener(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    const doc = await UserDocsRepository.obtener(c, req.params.id || '');
    if (!doc) { res.status(404).json({ error: 'no_encontrado' }); return; }
    res.json(doc);
  },

  // Admin: crea/actualiza (asignar suscripción a un usuario, responder ticket…).
  async upsert(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const uid = (body.uid as string) || null;
    res.json(await UserDocsRepository.upsert(c, req.params.id || '', uid, body));
  },

  async borrar(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || ''; if (!valida(c, res)) return;
    const ok = await UserDocsRepository.borrar(c, req.params.id || '');
    res.status(ok ? 200 : 404).json({ ok });
  },
};
