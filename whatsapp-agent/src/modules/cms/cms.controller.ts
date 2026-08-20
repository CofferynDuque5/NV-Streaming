/**
 * Controlador del CMS. Lectura pública para el contenido de tienda; escritura
 * solo admin. Lista blanca de colecciones (no se puede crear colecciones
 * arbitrarias por la API).
 */
import type { Request, Response } from 'express';
import { CmsRepository } from '../../db/repositories/cms.repo.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

// Colecciones de LECTURA PÚBLICA (contenido de la tienda que ve cualquiera).
export const CMS_PUBLICAS = new Set<string>([
  'servicios_sistema', 'ofertas', 'combos_suscripciones', 'carteleras_estrenos',
  'metodos_pago_config', 'tarjetas_header', 'preguntas_frecuentes', 'plataformas',
  'configuracion_sistema', 'banners_posiciones', 'comentarios',
]);

// Colecciones GESTIONABLES por esta API (públicas + internas de admin).
export const CMS_GESTIONABLES = new Set<string>([
  ...CMS_PUBLICAS,
  'respuestas_rapidas', 'flyers_revendedores', 'plantillas_permisos', 'notificaciones_admin',
]);

function validarColeccion(c: string, res: Response): boolean {
  if (!CMS_GESTIONABLES.has(c)) { res.status(404).json({ error: 'coleccion_desconocida' }); return false; }
  return true;
}

// Para colecciones no públicas, exige sesión.
function puedeLeer(coleccion: string, req: Request): boolean {
  if (CMS_PUBLICAS.has(coleccion)) return true;
  return !!(req as AuthedRequest).user;
}

export const CmsController = {
  async listar(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    if (!puedeLeer(c, req)) { res.status(401).json({ error: 'no_autenticado' }); return; }
    res.json({ coleccion: c, documentos: await CmsRepository.listar(c) });
  },

  async obtener(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    if (!puedeLeer(c, req)) { res.status(401).json({ error: 'no_autenticado' }); return; }
    const doc = await CmsRepository.obtener(c, req.params.id || '');
    if (!doc) { res.status(404).json({ error: 'no_encontrado' }); return; }
    res.json(doc);
  },

  // Escritura: solo admin (protegido en las rutas con requireRol('admin')).
  async upsert(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const doc = await CmsRepository.upsert(c, req.params.id || '', body);
    res.json(doc);
  },

  async borrar(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    const ok = await CmsRepository.borrar(c, req.params.id || '');
    res.status(ok ? 200 : 404).json({ ok });
  },
};
