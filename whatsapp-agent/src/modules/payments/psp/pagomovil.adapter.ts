/**
 * pagomovil.adapter.ts — Adaptador genérico de Pago Móvil (Venezuela).
 *
 * En Venezuela no existe un webhook estándar único: la confirmación llega desde
 * un puente/agregador o un bot que lee las notificaciones del banco (BDV,
 * Banesco, etc.). Este adaptador define un CONTRATO simple y seguro que ese
 * puente debe cumplir:
 *
 *   Cabecera `x-nvpay-signature: <hex>` = HMAC-SHA256(PAGO_MOVIL_WEBHOOK_SECRET, rawBody)
 *   Cuerpo JSON:
 *     { "id": "...", "referencia": "004512", "monto": 360.5, "moneda": "VES",
 *       "estado": "aprobado", "telefono": "0412...", "banco": "0102" }
 *
 * `referencia` mapea con `pagos.referencia` (el nº de referencia que el cliente
 * usó al pagar). `id` es único y sirve como anti-duplicado.
 */
import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import type { PSPAdapter, NotificacionPSP, HeadersLike } from './types.js';

interface PagoMovilBody {
  id?: string;
  referencia?: string | number;
  monto?: string | number;
  moneda?: string;
  estado?: string;
}

const ESTADOS_OK = new Set(['aprobado', 'confirmado', 'success', 'pagado', 'ok', 'completado']);

export const pagoMovilAdapter: PSPAdapter = {
  proveedor: 'pago_movil',

  verificarFirma(rawBody: Buffer, headers: HeadersLike): boolean {
    const secret = env.PAGO_MOVIL_WEBHOOK_SECRET;
    if (!secret) { logger.warn('PAGO_MOVIL_WEBHOOK_SECRET no configurado: webhook Pago Móvil rechazado'); return false; }
    const signature = headers.get('x-nvpay-signature');
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signature.toLowerCase());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  parsear(body: unknown): NotificacionPSP | null {
    const b = (body ?? {}) as PagoMovilBody;
    const referencia = String(b.referencia ?? '').trim();
    const idExterno = String(b.id ?? referencia).trim();
    if (!referencia || !idExterno) return null;
    return {
      proveedor: 'pago_movil',
      id_externo: idExterno,
      referencia,
      monto: Number(b.monto ?? 0),
      moneda: String(b.moneda ?? 'VES').toUpperCase(),
      exitoso: ESTADOS_OK.has(String(b.estado ?? '').toLowerCase()),
    };
  },
};
