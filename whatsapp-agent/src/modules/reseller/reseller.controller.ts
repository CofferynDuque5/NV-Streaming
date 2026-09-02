/**
 * reseller.controller.ts — Panel de revendedor (referidos + comisiones reales).
 * Cualquier usuario autenticado tiene un perfil de revendedor (su propio código
 * de referido). Todo se lee/mueve en PostgreSQL vía ResellerRepository.
 *
 * Sin manejo de errores local: `ResellerError` extiende `AppError`, así que los
 * fallos de dominio (sin_comisiones → 409, usuario_no_encontrado → 404) se
 * propagan al `errorHandler` central. Las rutas envuelven con `asyncHandler`.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ResellerRepository } from '../../db/repositories/reseller.repo.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

/** Esquema del cuerpo de POST /reseller/withdraw (método de pago opcional). */
export const esquemaRetiro = z.object({
  metodo: z.string().trim().min(1).max(40).optional(),
});

const usuarioDe = (req: Request): string => (req as AuthedRequest).user!.sub;

export const ResellerController = {
  /** Resumen + identidad (código, enlace de referido) + KPIs + comisiones. */
  async overview(req: Request, res: Response): Promise<void> {
    res.json({ resumen: await ResellerRepository.resumen(usuarioDe(req)) });
  },

  /** CRM: clientes referidos con su actividad real. */
  async clients(req: Request, res: Response): Promise<void> {
    res.json({ clientes: await ResellerRepository.clientes(usuarioDe(req)) });
  },

  /** Libro de comisiones del revendedor. */
  async commissions(req: Request, res: Response): Promise<void> {
    res.json({ comisiones: await ResellerRepository.comisiones(usuarioDe(req)) });
  },

  /** Retira las comisiones disponibles al saldo de la billetera (atómico). */
  async withdraw(req: Request, res: Response): Promise<void> {
    const metodo = (req.body as z.infer<typeof esquemaRetiro>).metodo;
    res.json(await ResellerRepository.retirar(usuarioDe(req), metodo));
  },
};

export default ResellerController;
