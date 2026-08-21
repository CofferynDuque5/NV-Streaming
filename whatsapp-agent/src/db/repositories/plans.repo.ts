/** Repositorio de Planes (catálogo de precios). */
import { query } from '../pool.js';
import type { Plan } from '../models.js';

type PlanRow = Plan;

const toPlan = (r: PlanRow): Plan => ({
  id: r.id, plataforma_id: r.plataforma_id, nombre: r.nombre,
  precio: r.precio, moneda: r.moneda, duracion_dias: r.duracion_dias, activo: r.activo,
});

export const PlansRepository = {
  async findById(id: string): Promise<Plan | null> {
    const rows = await query<PlanRow>(`SELECT * FROM planes WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? toPlan(rows[0]) : null;
  },

  /** Todos los planes activos (catálogo real para el frontend). */
  async allActive(): Promise<Plan[]> {
    const rows = await query<PlanRow>(`SELECT * FROM planes WHERE activo = TRUE ORDER BY plataforma_id ASC, precio ASC`);
    return rows.map(toPlan);
  },

  /** Plan activo de una plataforma (para calcular el monto a pagar). */
  async findActiveByPlatform(plataformaId: string): Promise<Plan | null> {
    const rows = await query<PlanRow>(
      `SELECT * FROM planes WHERE plataforma_id = $1 AND activo = TRUE
       ORDER BY precio ASC LIMIT 1`,
      [plataformaId],
    );
    return rows[0] ? toPlan(rows[0]) : null;
  },

  /* ───────────── Administración de planes (Back Office) ───────────── */

  /** Todos los planes (activos e inactivos) para el panel admin. */
  async todos(): Promise<Plan[]> {
    const rows = await query<PlanRow>(`SELECT * FROM planes ORDER BY plataforma_id ASC, precio ASC`);
    return rows.map(toPlan);
  },

  async crear(p: { plataformaId: string; nombre: string; precio: number | string; moneda?: string; duracionDias: number; activo?: boolean }): Promise<Plan> {
    const rows = await query<PlanRow>(
      `INSERT INTO planes (plataforma_id, nombre, precio, moneda, duracion_dias, activo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [p.plataformaId, p.nombre, p.precio, p.moneda ?? 'USD', p.duracionDias, p.activo ?? true],
    );
    return toPlan(rows[0]!);
  },

  async actualizar(id: string, patch: { nombre?: string; precio?: number | string; moneda?: string; duracionDias?: number; activo?: boolean }): Promise<Plan | null> {
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    const add = (col: string, v: unknown) => { sets.push(`${col} = $${i++}`); vals.push(v); };
    if (patch.nombre !== undefined) add('nombre', patch.nombre);
    if (patch.precio !== undefined) add('precio', patch.precio);
    if (patch.moneda !== undefined) add('moneda', patch.moneda);
    if (patch.duracionDias !== undefined) add('duracion_dias', patch.duracionDias);
    if (patch.activo !== undefined) add('activo', patch.activo);
    if (!sets.length) return this.findById(id);
    vals.push(id);
    const rows = await query<PlanRow>(`UPDATE planes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    return rows[0] ? toPlan(rows[0]) : null;
  },

  /** Borra un plan. Lanza si está referenciado por suscripciones/pagos (FK). */
  async eliminar(id: string): Promise<boolean> {
    const rows = await query<{ id: string }>(`DELETE FROM planes WHERE id = $1 RETURNING id`, [id]);
    return rows.length > 0;
  },
};
