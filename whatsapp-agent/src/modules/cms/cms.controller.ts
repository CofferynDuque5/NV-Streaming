/**
 * Controlador del CMS. Lectura pública para el contenido de tienda; escritura
 * solo admin. Lista blanca de colecciones (no se puede crear colecciones
 * arbitrarias por la API).
 */
import type { Request, Response } from 'express';
import { CmsRepository } from '../../db/repositories/cms.repo.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';
import { cacheCms } from '../../core/cache.js';

// Prefijo de clave de caché por colección (agrupa lista + documentos sueltos).
const claveLista = (coleccion: string): string => `cms:list:${coleccion}`;

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
  'paginas_layout', // layout del editor visual (lectura pública SOLO si está publicado)
]);

// Colecciones de lectura CONDICIONAL: el público solo ve los documentos con
// `publicado === true`; el admin (con sesión) ve también los borradores. Así el
// storefront estático puede renderizar lo que el editor publica sin exponer
// borradores a cualquiera.
export const CMS_PUBLICAS_PUBLICADAS = new Set<string>(['paginas_layout']);

function validarColeccion(c: string, res: Response): boolean {
  if (!CMS_GESTIONABLES.has(c)) { res.status(404).json({ error: 'coleccion_desconocida' }); return false; }
  return true;
}

// Para colecciones no públicas, exige sesión (salvo las de lectura condicional,
// que dejan pasar y luego se filtran por `publicado`).
function puedeLeer(coleccion: string, req: Request): boolean {
  if (CMS_PUBLICAS.has(coleccion)) return true;
  if (CMS_PUBLICAS_PUBLICADAS.has(coleccion)) return true;
  return !!(req as AuthedRequest).user;
}

// ¿La petición está autenticada? (los admins/usuarios ven borradores).
function estaAutenticado(req: Request): boolean {
  return !!(req as AuthedRequest).user;
}

// Un documento de layout es visible sin sesión solo si está publicado.
function layoutPublicado(doc: unknown): boolean {
  return !!(doc && typeof doc === 'object' && (doc as Record<string, unknown>).publicado === true);
}

export const CmsController = {
  async listar(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    if (!puedeLeer(c, req)) { res.status(401).json({ error: 'no_autenticado' }); return; }
    // Solo cacheamos las colecciones públicas (contenido de tienda, muy leído y
    // casi estático). Las privadas siempre van a BD.
    let documentos = CMS_PUBLICAS.has(c)
      ? await cacheCms.obtenerO(claveLista(c), () => CmsRepository.listar(c))
      : await CmsRepository.listar(c);
    // Lectura condicional: sin sesión, solo se listan los layouts publicados.
    if (CMS_PUBLICAS_PUBLICADAS.has(c) && !estaAutenticado(req)) {
      documentos = (documentos || []).filter(layoutPublicado);
    }
    res.json({ coleccion: c, documentos });
  },

  async obtener(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    if (!puedeLeer(c, req)) { res.status(401).json({ error: 'no_autenticado' }); return; }
    const doc = await CmsRepository.obtener(c, req.params.id || '');
    if (!doc) { res.status(404).json({ error: 'no_encontrado' }); return; }
    // Lectura condicional: sin sesión, un layout no publicado no existe (404).
    if (CMS_PUBLICAS_PUBLICADAS.has(c) && !estaAutenticado(req) && !layoutPublicado(doc)) {
      res.status(404).json({ error: 'no_encontrado' }); return;
    }
    res.json(doc);
  },

  // Escritura: solo admin (protegido en las rutas con requireRol('admin')).
  async upsert(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const doc = await CmsRepository.upsert(c, req.params.id || '', body);
    cacheCms.invalidar(claveLista(c)); // el contenido cambió → refrescar caché.
    res.json(doc);
  },

  async borrar(req: Request, res: Response): Promise<void> {
    const c = req.params.coleccion || '';
    if (!validarColeccion(c, res)) return;
    const ok = await CmsRepository.borrar(c, req.params.id || '');
    cacheCms.invalidar(claveLista(c));
    res.status(ok ? 200 : 404).json({ ok });
  },
};
