/**
 * binance.adapter.ts — Adaptador de Binance Pay (webhook de notificación).
 *
 * Verificación de firma (esquema oficial de Binance Pay):
 *   payload = `${timestamp}\n${nonce}\n${rawBody}\n`
 *   firma   = HMAC-SHA512(BINANCE_PAY_SECRET, payload) en HEX MAYÚSCULAS
 *   se compara con la cabecera `BinancePay-Signature`.
 *
 * El cuerpo trae `bizStatus` y `data` (JSON string) con `merchantTradeNo`
 * (nuestra referencia), `totalFee` y `currency`.
 */
import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import type { PSPAdapter, NotificacionPSP, HeadersLike } from './types.js';

interface BinanceBody {
  bizType?: string;
  bizId?: string | number;
  bizStatus?: string;
  data?: string;
}
interface BinanceData {
  merchantTradeNo?: string;
  transactionId?: string;
  totalFee?: string | number;
  currency?: string;
}

export const binanceAdapter: PSPAdapter = {
  proveedor: 'binance',

  verificarFirma(rawBody: Buffer, headers: HeadersLike): boolean {
    const secret = env.BINANCE_PAY_SECRET;
    if (!secret) { logger.warn('BINANCE_PAY_SECRET no configurado: webhook Binance rechazado'); return false; }
    const timestamp = headers.get('binancepay-timestamp');
    const nonce = headers.get('binancepay-nonce');
    const signature = headers.get('binancepay-signature');
    if (!timestamp || !nonce || !signature) return false;

    const payload = `${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`;
    const expected = crypto.createHmac('sha512', secret).update(payload).digest('hex').toUpperCase();
    const a = Buffer.from(signature.toUpperCase());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  parsear(body: unknown): NotificacionPSP | null {
    const b = (body ?? {}) as BinanceBody;
    if (b.bizType && b.bizType !== 'PAY') return null; // ignora otros eventos
    let data: BinanceData = {};
    try { data = b.data ? (JSON.parse(b.data) as BinanceData) : {}; } catch { data = {}; }

    const referencia = String(data.merchantTradeNo ?? '');
    const idExterno = String(data.transactionId ?? b.bizId ?? referencia);
    if (!referencia || !idExterno) return null;

    return {
      proveedor: 'binance',
      id_externo: idExterno,
      referencia,
      monto: Number(data.totalFee ?? 0),
      moneda: String(data.currency ?? 'USDT').toUpperCase(),
      exitoso: b.bizStatus === 'PAY_SUCCESS',
    };
  },
};
