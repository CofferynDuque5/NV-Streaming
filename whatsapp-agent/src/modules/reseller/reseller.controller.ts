/**
 * reseller.controller.ts — Panel de revendedor (referidos + comisiones reales).
 * Cualquier usuario autenticado tiene un perfil de revendedor (su propio código
 * de referido). Todo se lee/mueve en PostgreSQL vía ResellerRepository.
 */
import type { Request, Response } from 'express';
import { ResellerRepository, ResellerError } from '../../db/repositories/reseller.repo.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

function manejarError(e: unknown, res: Response): void {
  if (e instanceof ResellerError) {
    const status = e.code === 'sin_comisiones' ? 409 : e.code === 'usuario_no_encontrado' ? 404 : 400;
    res.status(status).json({ error: e.code, mensaje: e.message });
    return;
  }
  res.status(500).json({ error: 'error_interno' });
}

export const ResellerController = {
  /** Resumen + identidad (código, enlace de referido) + KPIs + comisiones. */
  async overview(req: Request, res: Response): Promise<void> {
    try {
      const uid = (req as AuthedRequest).user!.sub;
      res.json({ resumen: await ResellerRepository.resumen(uid) });
    } catch (e) { manejarError(e, res); }
  },

  /** CRM: clientes referidos con su actividad real. */
  async clients(req: Request, res: Response): Promise<void> {
    try {
      const uid = (req as AuthedRequest).user!.sub;
      res.json({ clientes: await ResellerRepository.clientes(uid) });
    } catch (e) { manejarError(e, res); }
  },

  /** Libro de comisiones del revendedor. */
  async commissions(req: Request, res: Response): Promise<void> {
    try {
      const uid = (req as AuthedRequest).user!.sub;
      res.json({ comisiones: await ResellerRepository.comisiones(uid) });
    } catch (e) { manejarError(e, res); }
  },

  /** Retira las comisiones disponibles al saldo de la billetera (atómico). */
  async withdraw(req: Request, res: Response): Promise<void> {
    try {
      const uid = (req as AuthedRequest).user!.sub;
      const metodo = typeof req.body?.metodo === 'string' ? req.body.metodo : undefined;
      res.json(await ResellerRepository.retirar(uid, metodo));
    } catch (e) { manejarError(e, res); }
  },
};

export default ResellerController;
