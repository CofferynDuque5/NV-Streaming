/** Controlador del webhook de pasarelas de pago (PSP). */
import type { Response } from 'express';
import type { RawBodyRequest } from '../../webhook/webhook.controller.js';
import { logger } from '../../../utils/logger.js';
import { procesarNotificacionPSP } from './psp.service.js';

export const PspController = {
  // POST /pagos/webhook/:proveedor  (binance | pago_movil)
  async recibir(req: RawBodyRequest, res: Response): Promise<void> {
    const proveedor = String(req.params['proveedor'] ?? '');
    // El cuerpo crudo lo captura el middleware global (server.ts) para la firma.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    try {
      const r = await procesarNotificacionPSP(proveedor, raw, req, req.body);
      res.status(r.status).json({ ok: r.ok, motivo: r.motivo, ...(r.pago_id ? { pago_id: r.pago_id } : {}) });
    } catch (err) {
      logger.error({ err, proveedor }, 'PSP: error inesperado procesando webhook');
      // 200 para no provocar reintentos en bucle; el error queda registrado.
      res.status(200).json({ ok: false, motivo: 'error_interno' });
    }
  },
};
