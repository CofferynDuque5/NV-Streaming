/**
 * Repositorio del CMS (document store JSONB). Único lugar que toca la tabla
 * `cms_documentos`. Devuelve documentos con la forma { id, ...campos } que
 * espera el frontend (igual que un doc de Firestore).
 */
import { query } from '../pool.js';

export type CmsDoc = Record<string, unknown> & { id: string };

type Row = { doc_id: string; data: Record<string, unknown> };
const toDoc = (r: Row): CmsDoc => ({ id: r.doc_id, ...(r.data || {}) });

export const CmsRepository = {
  /** Lista los documentos de una colección, ordenados por `orden` y luego id. */
  async listar(coleccion: string): Promise<CmsDoc[]> {
    const rows = await query<Row>(
      `SELECT doc_id, data FROM cms_documentos WHERE coleccion = $1 ORDER BY orden ASC, doc_id ASC`,
      [coleccion],
    );
    return rows.map(toDoc);
  },

  /** Obtiene un documento concreto. */
  async obtener(coleccion: string, docId: string): Promise<CmsDoc | null> {
    const rows = await query<Row>(
      `SELECT doc_id, data FROM cms_documentos WHERE coleccion = $1 AND doc_id = $2 LIMIT 1`,
      [coleccion, docId],
    );
    return rows[0] ? toDoc(rows[0]) : null;
  },

  /** Crea o actualiza un documento (upsert). Guarda el objeto completo en JSONB. */
  async upsert(coleccion: string, docId: string, data: Record<string, unknown>): Promise<CmsDoc> {
    const { id: _omit, ...campos } = data;
    const orden = Number((campos as { orden?: unknown }).orden) || 0;
    // `activo` es true salvo que el doc lo marque explícitamente como false.
    const c = campos as { activo?: unknown; estado_activo?: unknown };
    const activo = c.activo !== false && c.estado_activo !== false;
    const rows = await query<Row>(
      `INSERT INTO cms_documentos (coleccion, doc_id, data, orden, activo)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (coleccion, doc_id)
       DO UPDATE SET data = EXCLUDED.data, orden = EXCLUDED.orden, activo = EXCLUDED.activo
       RETURNING doc_id, data`,
      [coleccion, docId, JSON.stringify(campos), orden, activo],
    );
    return toDoc(rows[0]!);
  },

  /** Borra un documento. Devuelve true si existía. */
  async borrar(coleccion: string, docId: string): Promise<boolean> {
    const rows = await query<{ doc_id: string }>(
      `DELETE FROM cms_documentos WHERE coleccion = $1 AND doc_id = $2 RETURNING doc_id`,
      [coleccion, docId],
    );
    return rows.length > 0;
  },
};
