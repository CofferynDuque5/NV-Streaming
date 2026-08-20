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
};
