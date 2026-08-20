/**
 * invoice.ts — Generador de la Factura Digital (comprobante de compra).
 *
 * Construye los datos y el HTML de la factura que se envía por correo al
 * confirmar un pago: Servicio, Monto, Fecha de Vencimiento, etc. Los importes
 * provienen de la BD (no se inventan).
 */
import { env } from '../../config/env.js';

export interface Factura {
  numero: string;
  fecha: string;             // YYYY-MM-DD
  cliente_nombre: string;
  cliente_email: string;
  servicio: string;
  plan: string;
  monto: string;
  moneda: string;
  vencimiento: string | null; // YYYY-MM-DD
  metodo: string | null;
}

export interface ConstruirFacturaInput {
  pagoId: string;
  fecha?: Date;
  cliente_nombre?: string | null;
  cliente_email: string;
  servicio: string;
  plan: string;
  monto: string;
  moneda: string;
  vencimiento?: Date | null;
  metodo?: string | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Número de factura estable derivado del id de pago (sin aleatoriedad). */
export function facturaNumero(pagoId: string, fecha: Date): string {
  const corto = String(pagoId).replace(/-/g, '').slice(0, 8).toUpperCase();
  return `NV-${ymd(fecha).replace(/-/g, '')}-${corto}`;
}

export function construirFactura(input: ConstruirFacturaInput): Factura {
  const fecha = input.fecha ?? new Date();
  return {
    numero: facturaNumero(input.pagoId, fecha),
    fecha: ymd(fecha),
    cliente_nombre: input.cliente_nombre || 'Cliente',
    cliente_email: input.cliente_email,
    servicio: input.servicio,
    plan: input.plan,
    monto: input.monto,
    moneda: input.moneda,
    vencimiento: input.vencimiento ? ymd(input.vencimiento) : null,
    metodo: input.metodo ?? null,
  };
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** HTML de la factura (email-safe, estilos inline). */
export function facturaHtml(f: Factura): string {
  const empresa = env.EMPRESA_NOMBRE;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0d0d1b">
  <div style="background:#0d0d1b;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px">${esc(empresa)}</h1>
    <div style="opacity:.7;font-size:13px">Factura digital · Comprobante de compra</div>
  </div>
  <div style="border:1px solid #e6e6ef;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <table style="width:100%;font-size:13px;color:#555;margin-bottom:16px">
      <tr><td>Factura N.º</td><td style="text-align:right;color:#0d0d1b"><b>${esc(f.numero)}</b></td></tr>
      <tr><td>Fecha</td><td style="text-align:right;color:#0d0d1b">${esc(f.fecha)}</td></tr>
      <tr><td>Cliente</td><td style="text-align:right;color:#0d0d1b">${esc(f.cliente_nombre)}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#f4f4fb">
        <th align="left" style="padding:10px;border-bottom:1px solid #e6e6ef">Servicio</th>
        <th align="right" style="padding:10px;border-bottom:1px solid #e6e6ef">Monto</th>
      </tr></thead>
      <tbody><tr>
        <td style="padding:10px;border-bottom:1px solid #f0f0f5">${esc(f.plan || f.servicio)}${f.vencimiento ? `<br><span style="color:#888;font-size:12px">Vence: ${esc(f.vencimiento)}</span>` : ''}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid #f0f0f5">${esc(f.monto)} ${esc(f.moneda)}</td>
      </tr></tbody>
      <tfoot><tr>
        <td style="padding:10px" align="right"><b>Total</b></td>
        <td style="padding:10px" align="right"><b>${esc(f.monto)} ${esc(f.moneda)}</b></td>
      </tr></tfoot>
    </table>
    ${f.metodo ? `<div style="font-size:12px;color:#888;margin-top:8px">Método de pago: ${esc(f.metodo)}</div>` : ''}
    <p style="font-size:12px;color:#888;margin-top:20px">Gracias por tu compra en ${esc(empresa)}. Conserva este comprobante.</p>
  </div>
</div>`;
}
