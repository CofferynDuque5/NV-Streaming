/**
 * Repositorio de Cuentas de Streaming. Perfil ÚNICO por cliente: aquí no existe
 * lógica de múltiples perfiles por cuenta. Los métodos que asignan una cuenta se
 * añadirán en pasos posteriores (compra/renovación) y respetarán esa regla.
 */
import { query } from '../pool.js';
import type { CuentaStreaming } from '../models.js';

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
};

export interface StockPlataforma {
  plataforma_id: string;
  disponibles: number;
}
