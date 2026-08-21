/**
 * Repositorio de Cuentas de Streaming. Perfil ÚNICO por cliente: aquí no existe
 * lógica de múltiples perfiles por cuenta. Los métodos que asignan una cuenta se
 * añadirán en pasos posteriores (compra/renovación) y respetarán esa regla.
 */
import { query } from '../pool.js';
import { encrypt } from '../../utils/crypto.js';
import type { CuentaStreaming } from '../models.js';

/** Vista de cuenta SIN la contraseña (para listar en el panel admin). */
export interface CuentaAdmin {
  id: string; plataforma_id: string; correo: string; perfil: string;
  pin: string | null; estado: CuentaStreaming['estado']; creado_en: Date;
}

type CuentaRow = {
  id: string;
  plataforma_id: string;
  correo: string;
  contrasena_cifrada: string;
  pin: string | null;
  perfil: string;
  estado: CuentaStreaming['estado'];
  creado_en: Date;
};

const toCuenta = (r: CuentaRow): CuentaStreaming => ({
  id: r.id,
  plataforma_id: r.plataforma_id,
  correo: r.correo,
  contrasena_cifrada: r.contrasena_cifrada,
  pin: r.pin,
  perfil: r.perfil,
  estado: r.estado,
  creado_en: r.creado_en,
});

export const AccountsRepository = {
  async findById(id: string): Promise<CuentaStreaming | null> {
    const rows = await query<CuentaRow>(`SELECT * FROM cuentas_streaming WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? toCuenta(rows[0]) : null;
  },

  /** Primera cuenta 'disponible' de una plataforma (para asignar como perfil único). */
  async findAvailableByPlatform(plataformaId: string): Promise<CuentaStreaming | null> {
    const rows = await query<CuentaRow>(
      `SELECT * FROM cuentas_streaming
       WHERE plataforma_id = $1 AND estado = 'disponible'
       ORDER BY creado_en ASC
       LIMIT 1`,
      [plataformaId],
    );
    return rows[0] ? toCuenta(rows[0]) : null;
  },

  /** Nº de perfiles/cuentas 'disponible' de una plataforma (stock). */
  async countAvailableFor(plataformaId: string): Promise<number> {
    const rows = await query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM cuentas_streaming WHERE plataforma_id = $1 AND estado = 'disponible'`,
      [plataformaId],
    );
    return Number(rows[0]?.n ?? 0);
  },

  /** Stock disponible por plataforma (para el inventario que consulta la IA). */
  async countAvailableByPlatform(): Promise<StockPlataforma[]> {
    return query<StockPlataforma>(
      `SELECT plataforma_id, COUNT(*)::int AS disponibles
       FROM cuentas_streaming
       WHERE estado = 'disponible'
       GROUP BY plataforma_id
       ORDER BY plataforma_id ASC`,
    );
  },

  /* ───────────── Administración de cuentas (Back Office) ───────────── */

  /** Lista de cuentas SIN contraseña (opcionalmente filtrada por plataforma). */
  async listarAdmin(plataformaId?: string): Promise<CuentaAdmin[]> {
    const rows = plataformaId
      ? await query<CuentaAdmin>(`SELECT id, plataforma_id, correo, perfil, pin, estado, creado_en FROM cuentas_streaming WHERE plataforma_id = $1 ORDER BY creado_en DESC`, [plataformaId])
      : await query<CuentaAdmin>(`SELECT id, plataforma_id, correo, perfil, pin, estado, creado_en FROM cuentas_streaming ORDER BY plataforma_id ASC, creado_en DESC`);
    return rows;
  },

  /** Resumen de stock por plataforma y estado (disponible/asignada/…). */
  async resumenStock(): Promise<Array<{ plataforma_id: string; estado: string; n: number }>> {
    return query<{ plataforma_id: string; estado: string; n: number }>(
      `SELECT plataforma_id, estado, COUNT(*)::int AS n
       FROM cuentas_streaming GROUP BY plataforma_id, estado ORDER BY plataforma_id ASC, estado ASC`);
  },

  /** Crea una cuenta (la contraseña se cifra en reposo con AES-256-GCM). */
  async crear(p: { plataformaId: string; correo: string; contrasena: string; pin?: string | null; perfil?: string }): Promise<CuentaAdmin> {
    const rows = await query<CuentaAdmin>(
      `INSERT INTO cuentas_streaming (plataforma_id, correo, contrasena_cifrada, pin, perfil, estado)
       VALUES ($1,$2,$3,$4,$5,'disponible')
       RETURNING id, plataforma_id, correo, perfil, pin, estado, creado_en`,
      [p.plataformaId, p.correo, encrypt(p.contrasena), p.pin ?? null, p.perfil ?? 'Perfil'],
    );
    return rows[0]!;
  },

  /** Actualiza campos de una cuenta (si viene contraseña, se re-cifra). */
  async actualizar(id: string, patch: { correo?: string; contrasena?: string; pin?: string | null; perfil?: string; estado?: CuentaStreaming['estado'] }): Promise<CuentaAdmin | null> {
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    const add = (col: string, v: unknown) => { sets.push(`${col} = $${i++}`); vals.push(v); };
    if (patch.correo !== undefined) add('correo', patch.correo);
    if (patch.contrasena !== undefined) add('contrasena_cifrada', encrypt(patch.contrasena));
    if (patch.pin !== undefined) add('pin', patch.pin);
    if (patch.perfil !== undefined) add('perfil', patch.perfil);
    if (patch.estado !== undefined) add('estado', patch.estado);
    if (!sets.length) { const c = await this.findById(id); return c ? { id: c.id, plataforma_id: c.plataforma_id, correo: c.correo, perfil: c.perfil, pin: c.pin, estado: c.estado, creado_en: c.creado_en } : null; }
    vals.push(id);
    const rows = await query<CuentaAdmin>(
      `UPDATE cuentas_streaming SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, plataforma_id, correo, perfil, pin, estado, creado_en`, vals);
    return rows[0] ?? null;
  },

  /** Borra una cuenta. Falla (FK RESTRICT) si tiene suscripción asociada. */
  async eliminar(id: string): Promise<boolean> {
    const rows = await query<{ id: string }>(`DELETE FROM cuentas_streaming WHERE id = $1 RETURNING id`, [id]);
    return rows.length > 0;
  },
};

export interface StockPlataforma {
  plataforma_id: string;
  disponibles: number;
}
