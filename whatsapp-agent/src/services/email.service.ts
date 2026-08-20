/**
 * email.service.ts — Envío de correos (SMTP vía nodemailer).
 *
 * Dos correos automáticos:
 *   · Bienvenida (con enlace a Términos y Condiciones) al registrarse.
 *   · Factura digital al confirmarse un pago.
 *
 * El transporte es inyectable (tests sin SMTP). Si SMTP no está configurado,
 * degrada con elegancia: registra y devuelve null (no rompe el flujo).
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { facturaHtml, type Factura } from '../modules/billing/invoice.js';

export interface EmailAttachment { filename: string; content?: string; path?: string; contentType?: string }
export interface EmailMessage { to: string; subject: string; html: string; attachments?: EmailAttachment[] }
export interface EmailTransport { sendMail(msg: EmailMessage & { from: string }): Promise<{ messageId?: string }> }

export interface EmailService {
  enviar(msg: EmailMessage): Promise<{ id: string } | null>;
  enviarBienvenida(to: string, nombre: string | null): Promise<{ id: string } | null>;
  enviarFactura(to: string, factura: Factura): Promise<{ id: string } | null>;
}

export interface EmailOptions {
  transport?: EmailTransport;
  from?: string;
  termsUrl?: string;
  empresa?: string;
}

function realTransport(): EmailTransport | null {
  if (!env.SMTP_HOST) return null;
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return { sendMail: (msg) => t.sendMail(msg) as Promise<{ messageId?: string }> };
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function createEmailService(opts: EmailOptions = {}): EmailService {
  const transport = opts.transport ?? realTransport();
  const from = opts.from ?? env.EMAIL_FROM;
  const termsUrl = opts.termsUrl ?? env.TERMS_URL;
  const empresa = opts.empresa ?? env.EMPRESA_NOMBRE;

  async function enviar(msg: EmailMessage): Promise<{ id: string } | null> {
    if (!transport) { logger.warn({ to: msg.to }, 'SMTP no configurado: correo no enviado'); return null; }
    try {
      const res = await transport.sendMail({ from, ...msg });
      logger.info({ to: msg.to, id: res.messageId, subject: msg.subject }, 'Correo enviado');
      return { id: res.messageId ?? '' };
    } catch (err) {
      logger.error({ err, to: msg.to }, 'Fallo enviando correo');
      return null;
    }
  }

  function enviarBienvenida(to: string, nombre: string | null) {
    const nom = esc(nombre || 'y bienvenido');
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0d0d1b">
      <div style="background:#0d0d1b;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:22px">¡Hola ${nom}! 👋</h1>
        <div style="opacity:.75;font-size:13px">Bienvenido a ${esc(empresa)}</div>
      </div>
      <div style="border:1px solid #e6e6ef;border-top:none;border-radius:0 0 12px 12px;padding:24px;font-size:14px;line-height:1.6">
        <p>Gracias por registrarte en <b>${esc(empresa)}</b>. Ya puedes comprar y gestionar tus suscripciones de streaming al mejor precio.</p>
        <p>Antes de comenzar, revisa nuestros <b>Términos y Condiciones</b>:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${esc(termsUrl)}" style="background:#00d2ff;color:#02040c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">Ver Términos y Condiciones</a>
        </p>
        <p style="font-size:12px;color:#888">Si no creaste esta cuenta, ignora este mensaje.</p>
      </div>
    </div>`;
    return enviar({
      to,
      subject: `Bienvenido a ${empresa} · Términos y Condiciones`,
      html,
      // Además del enlace, se adjunta el documento como archivo .html.
      attachments: [{ filename: 'Terminos-y-Condiciones.html', content: `<h1>Términos y Condiciones — ${esc(empresa)}</h1><p>Consulta la versión vigente en: ${esc(termsUrl)}</p>`, contentType: 'text/html' }],
    });
  }

  function enviarFactura(to: string, factura: Factura) {
    return enviar({
      to,
      subject: `Factura ${factura.numero} · ${empresa}`,
      html: facturaHtml(factura),
    });
  }

  return { enviar, enviarBienvenida, enviarFactura };
}

// Instancia por defecto.
export const emailService: EmailService = createEmailService();
