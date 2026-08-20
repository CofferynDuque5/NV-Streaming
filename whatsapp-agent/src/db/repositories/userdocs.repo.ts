/**
 * Repositorio de documentos por usuario (docs_usuario). Colecciones cuyo acceso
 * es "el dueño o el admin": suscripciones (web), tickets/chats de soporte y
 * notificaciones del cliente. Devuelve { id, uid, ...campos }.
 */
import { query } from '../pool.js';

export type UserDoc = Record<string, unknown> & { id: string; uid: string | null };

type Row = { doc_id: string; uid_usuario: string | null; data: Record<string, unknown> };
const toDoc = (r: Row): UserDoc => ({ id: r.doc_id, uid: r.uid_usuario, ...(r.data || {}) });

export const UserDocsRepository = {
  /** Documentos de una colección que pertenecen a un usuario. */
  async mios(coleccion: string, uid: string): Promise<UserDoc[]> {
    const rows = await query<Row>(
      `SELECT doc_id, uid_usuario, data FROM docs_usuario
       WHERE coleccion = $1 AND uid_usuario = $2 ORDER BY creado_en DESC`,
      [coleccion, uid],
    );
    return rows.map(toDoc);
  },

  /** Todos los documentos de una colección (admin). */
  async todos(coleccion: string): Promise<UserDoc[]> {
    const rows = await query<Row>(
      `SELECT doc_id, uid_usuario, data FROM docs_usuario WHERE coleccion = $1 ORDER BY creado_en DESC`,
      [coleccion],
    );
    return rows.map(toDoc);
  },

  async obtener(coleccion: string, docId: string): Promise<UserDoc | null> {
    const rows = await query<Row>(
      `SELECT doc_id, uid_usuario, data FROM docs_usuario WHERE coleccion = $1 AND doc_id = $2 LIMIT 1`,
      [coleccion, docId],
    );
    return rows[0] ? toDoc(rows[0]) : null;
  },

  /** Crea un documento propiedad de `uid` (p.ej. el cliente abre un ticket). */
  async crear(coleccion: string, uid: string | null, data: Record<string, unknown>): Promise<UserDoc> {
    const { id: _omit, uid: _omit2, ...campos } = data;
    const docId = 'd_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const rows = await query<Row>(
      `INSERT INTO docs_usuario (coleccion, doc_id, uid_usuario, data)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING doc_id, uid_usuario, data`,
      [coleccion, docId, uid, JSON.stringify(campos)],
    );
    return toDoc(rows[0]!);
  },

  /** Crea/actualiza un documento (admin): puede fijar el dueño y los campos. */
  async upsert(coleccion: string, docId: string, uid: string | null, data: Record<string, unknown>): Promise<UserDoc> {
    const { id: _omit, uid: _omit2, ...campos } = data;
    const rows = await query<Row>(
      `INSERT INTO docs_usuario (coleccion, doc_id, uid_usuario, data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (coleccion, doc_id)
       DO UPDATE SET data = EXCLUDED.data, uid_usuario = COALESCE(EXCLUDED.uid_usuario, docs_usuario.uid_usuario)
       RETURNING doc_id, uid_usuario, data`,
      [coleccion, docId, uid, JSON.stringify(campos)],
    );
    return toDoc(rows[0]!);
  },

  async borrar(coleccion: string, docId: string): Promise<boolean> {
    const rows = await query<{ doc_id: string }>(
      `DELETE FROM docs_usuario WHERE coleccion = $1 AND doc_id = $2 RETURNING doc_id`, [coleccion, docId]);
    return rows.length > 0;
  },
};
