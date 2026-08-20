/** Controladores HTTP de la pasarela de pago. */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { PaymentsRepository } from '../../db/repositories/payments.repo.js';
import { registrarPago, confirmarPago, rechazarPago } from './payments.service.js';

const RegistrarSchema = z.object({
  whatsappId: z.string().min(5).max(20),
  servicio: z.string().min(2).max(60),
  metodo: z.enum(['pago_movil', 'binance', 'zelle']),
  suscripcionId: z.string().uuid().nullish(),
  referencia: z.string().max(120).nullish(),
  comprobanteUrl: z.string().url().max(500).nullish(),
});

const RechazarSchema = z.object({ motivo: z.string().max(200).default('comprobante no válido') });

export const PaymentsController = {
  // POST /pagos — registra un pago pendiente (checkout / bot) y da instrucciones.
  async registrar(req: Request, res: Response): Promise<void> {
    const parsed = RegistrarSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'datos_invalidos', detalle: parsed.error.flatten().fieldErrors }); return; }
    const r = await registrarPago({
      whatsappId: parsed.data.whatsappId,
      servicio: parsed.data.servicio,
      metodo: parsed.data.metodo,
      suscripcionId: parsed.data.suscripcionId ?? null,
      referencia: parsed.data.referencia ?? null,
      comprobanteUrl: parsed.data.comprobanteUrl ?? null,
    });
    if (!r.ok) { res.status(422).json(r); return; }
    res.status(201).json({ ok: true, pago_id: r.pago.id, estado: r.pago.estado, monto: r.monto, moneda: r.moneda, metodo: r.metodo_nombre, instrucciones: r.instrucciones });
  },

  // GET /pagos/pendientes — (admin) lista de pagos por confirmar.
  async pendientes(_req: Request, res: Response): Promise<void> {
    const pagos = await PaymentsRepository.listPending();
    res.json({ ok: true, total: pagos.length, pagos });
  },

  // POST /pagos/:id/confirmar — (admin) confirma y renueva.
  async confirmar(req: Request, res: Response): Promise<void> {
    const adminId = req.get('x-admin-id') ?? 'admin';
    const r = await confirmarPago(req.params['id'] ?? '', adminId);
    if (!r.ok) { res.status(409).json(r); return; }
    res.json({ ok: true, resultado: r.resultado });
  },

  // POST /pagos/:id/rechazar — (admin) rechaza.
  async rechazar(req: Request, res: Response): Promise<void> {
    const adminId = req.get('x-admin-id') ?? 'admin';
    const parsed = RechazarSchema.safeParse(req.body ?? {});
    const motivo = parsed.success ? parsed.data.motivo : 'comprobante no válido';
    const r = await rechazarPago(req.params['id'] ?? '', adminId, motivo);
    if (!r.ok) { res.status(409).json(r); return; }
    res.json({ ok: true });
  },
};

export function logPaymentsError(err: unknown): void {
  logger.error({ err }, 'Error en pasarela de pago');
}
