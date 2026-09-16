/**
 * media.repo.ts — Biblioteca de medios (tabla `medios`).
 *
 * Responsabilidad única: persistir y consultar los registros de imágenes ya
 * alojadas en ImgBB. No sube nada: eso lo hace `media.service.ts`.
 */
import { query } from '../pool.js';

export interface MedioRow {
  id: string;
  nombre: string;
  uso: string;
  url: string;
  display_url: string;
  thumb_url: string;
  delete_url: string;
  imgbb_id: string;
  mime: string;
  tamano: number;
  ancho: number;
  alto: number;
  subido_por: string | null;
  creado_en: string;
}

export interface NuevoMedio {
  nombre: string;
  uso: string;
  url: string;
  display_url: string;
  thumb_url: string;
  delete_url: string;
  imgbb_id: string;
  mime: string;
  tamano: number;
  ancho: number;
  alto: number;
  subido_por: string | null;
}

const COLS = 'id, nombre, uso, url, display_url, thumb_url, delete_url, imgbb_id, mime, tamano, ancho, alto, subido_por, creado_en';

export const MediaRepository = {
  async listar(limite = 200): Promise<MedioRow[]> {
    return query<MedioRow>(`SELECT ${COLS} FROM medios ORDER BY creado_en DESC LIMIT $1`, [limite]);
  },

  async obtener(id: string): Promise<MedioRow | null> {
    const rows = await query<MedioRow>(`SELECT ${COLS} FROM medios WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async crear(m: NuevoMedio): Promise<MedioRow> {
    const rows = await query<MedioRow>(
      `INSERT INTO medios (nombre, uso, url, display_url, thumb_url, delete_url, imgbb_id, mime, tamano, ancho, alto, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${COLS}`,
      [m.nombre, m.uso, m.url, m.display_url, m.thumb_url, m.delete_url, m.imgbb_id, m.mime, m.tamano, m.ancho, m.alto, m.subido_por],
    );
    return rows[0]!;
  },

  async borrar(id: string): Promise<MedioRow | null> {
    const rows = await query<MedioRow>(`DELETE FROM medios WHERE id = $1 RETURNING ${COLS}`, [id]);
    return rows[0] ?? null;
  },
};
