/**
 * payments.service.ts — Pasarela de pago (cierra el ciclo de renovación).
 *
 * Flujo:
 *   1. registrarPago  → crea un pago PENDIENTE y devuelve las instrucciones del
 *      método (Pago Móvil / Binance / Zelle). El monto viene del plan (BD).
 *   2. confirmarPago  → (admin) marca el pago confirmado y RENUEVA la suscripción
 *      de forma atómica (pagada=true, estado=activa, vencimiento extendido).
 *      Notifica al cliente por WhatsApp; al quedar activa+pagada, el gate de
 *      credenciales se abre automáticamente.
 *   3. rechazarPago   → (admin) marca rechazado y avisa al cliente.
 *
 * Dependencias inyectables (repos + sender + catálogo de métodos) → testeable.
 */
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { PaymentsRepository, type ConfirmacionResultado } from '../../db/repositories/payments.repo.js';
import { PlansRepository } from '../../db/repositories/plans.repo.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { whatsappSender, type Sender } from '../../services/whatsapp.service.js';
import { emailService, type EmailService } from '../../services/email.service.js';
import { construirFactura } from '../billing/invoice.js';
import { getMetodoInfo } from '../../config/payment-methods.js';
import type { MetodoPago, Pago, Plan, Usuario } from '../../db/models.js';

export interface PaymentDeps {
  payments: {
    create(input: Parameters<typeof PaymentsRepository.create>[0]): Promise<Pago>;
    confirmAndRenew(pagoId: string, adminId: string): Promise<ConfirmacionResultado | null>;
    reject(pagoId: string, adminId: string, motivo: string): Promise<{ id_whatsapp: string; plataforma_id: string } | null>;
  };
  plans: { findActiveByPlatform(plataformaId: string): Promise<Plan | null> };
  users: { findByWhatsapp(id: string): Promise<Usuario | null> };
  sender: Sender;
  email?: EmailService;
  metodoInfo?: (m: string) => { nombre: string; instrucciones: string } | null;
}

export const defaultPaymentDeps: PaymentDeps = {
  payments: PaymentsRepository,
  plans: PlansRepository,
  users: UsersRepository,
  sender: whatsappSender,
  email: emailService,
  metodoInfo: getMetodoInfo,
};

export interface RegistrarPagoInput {
  whatsappId: string;
  servicio: string;               // plataforma_id
  metodo: MetodoPago;
  suscripcionId?: string | null;  // si renueva una suscripción existente
  referencia?: string | null;
  comprobanteUrl?: string | null;
}

export type RegistrarPagoResult =
  | { ok: false; motivo: string }
  | { ok: true; pago: Pago; instrucciones: string; monto: string; moneda: string; metodo_nombre: string };

export async function registrarPago(input: RegistrarPagoInput, deps: PaymentDeps = defaultPaymentDeps): Promise<RegistrarPagoResult> {
  const info = (deps.metodoInfo ?? getMetodoInfo)(input.metodo);
  if (!info) return { ok: false, motivo: 'metodo_invalido' };

  const usuario = await deps.users.findByWhatsapp(input.whatsappId);
  if (!usuario) return { ok: false, motivo: 'usuario_no_registrado' };

  const plan = await deps.plans.findActiveByPlatform(input.servicio);
  if (!plan) return { ok: false, motivo: 'servicio_sin_plan' };

  const pago = await deps.payments.create({
    usuario_id: usuario.id,
    suscripcion_id: input.suscripcionId ?? null,
    plataforma_id: input.servicio,
    plan_id: plan.id,
    metodo: input.metodo,
    monto: plan.precio,        // monto SIEMPRE desde la BD (no inventado)
    moneda: plan.moneda,
    referencia: input.referencia ?? null,
    comprobante_url: input.comprobanteUrl ?? null,
  });

  logger.info({ pagoId: pago.id, usuarioId: usuario.id, servicio: input.servicio, metodo: input.metodo }, 'Pago registrado (pendiente)');
  return { ok: true, pago, instrucciones: info.instrucciones, monto: plan.precio, moneda: plan.moneda, metodo_nombre: info.nombre };
}

export type ConfirmarPagoResult =
  | { ok: false; motivo: string }
  | { ok: true; resultado: ConfirmacionResultado };

export async function confirmarPago(pagoId: string, adminId: string, deps: PaymentDeps = defaultPaymentDeps): Promise<ConfirmarPagoResult> {
  const resultado = await deps.payments.confirmAndRenew(pagoId, adminId);
  if (!resultado) return { ok: false, motivo: 'pago_inexistente_o_no_pendiente' };
  const email = deps.email ?? emailService;

  // Sin stock: el pago se recibió pero no hay perfil libre → cola de espera.
  if (resultado.sin_stock) {
    if (resultado.id_whatsapp) {
      await deps.sender.sendText(
        resultado.id_whatsapp,
        `✅ Recibimos tu pago de ${resultado.plan_nombre}. En este momento no tenemos stock disponible, así que quedaste en la LISTA DE ESPERA (por orden de llegada). Te activaremos y avisaremos apenas se libere un perfil. ¡Gracias por tu paciencia! 🙏`,
      );
    }
    // Alerta al administrador por WhatsApp (además de la alerta en BD).
    if (env.ADMIN_WHATSAPP) {
      await deps.sender.sendText(env.ADMIN_WHATSAPP, `⚠️ Stock agotado de ${resultado.plataforma_id}. Cliente en cola de espera (pago ${resultado.pago_id}).`);
    }
    // Igual se envía la factura como comprobante del pago recibido.
    if (resultado.email) {
      const factura = construirFactura({
        pagoId: resultado.pago_id, cliente_nombre: resultado.cliente_nombre, cliente_email: resultado.email,
        servicio: resultado.plataforma_id, plan: resultado.plan_nombre, monto: resultado.monto, moneda: resultado.moneda,
        vencimiento: resultado.nueva_fecha_vencimiento, metodo: resultado.metodo,
      });
      await email.enviarFactura(resultado.email, factura);
    }
    logger.info({ pagoId, plataforma: resultado.plataforma_id }, 'Pago confirmado SIN stock → cola de espera');
    return { ok: true, resultado };
  }

  const cuando = resultado.nueva_fecha_vencimiento
    ? ` Tu ${resultado.plan_nombre} queda activo hasta el ${resultado.nueva_fecha_vencimiento.toISOString().slice(0, 10)}.`
    : ` Tu ${resultado.plan_nombre} fue activado.`;
  const acceso = resultado.asignado && resultado.perfil
    ? ` Perfil asignado: ${resultado.perfil}.`
    : '';
  if (resultado.id_whatsapp) {
    await deps.sender.sendText(
      resultado.id_whatsapp,
      `✅ ¡Pago confirmado!${cuando}${acceso} Escríbeme "mis datos de ${resultado.plataforma_id}" para recibir tu acceso.`,
    );
  }

  // Factura digital por correo (comprobante de compra).
  if (resultado.email) {
    const factura = construirFactura({
      pagoId: resultado.pago_id,
      cliente_nombre: resultado.cliente_nombre,
      cliente_email: resultado.email,
      servicio: resultado.plataforma_id,
      plan: resultado.plan_nombre,
      monto: resultado.monto,
      moneda: resultado.moneda,
      vencimiento: resultado.nueva_fecha_vencimiento,
      metodo: resultado.metodo,
    });
    await email.enviarFactura(resultado.email, factura);
  }

  logger.info({ pagoId, suscripcionId: resultado.suscripcion_id, factura: !!resultado.email }, 'Pago confirmado y suscripción renovada');
  return { ok: true, resultado };
}

export async function rechazarPago(pagoId: string, adminId: string, motivo: string, deps: PaymentDeps = defaultPaymentDeps): Promise<{ ok: boolean; motivo?: string }> {
  const r = await deps.payments.reject(pagoId, adminId, motivo || 'comprobante no válido');
  if (!r) return { ok: false, motivo: 'pago_inexistente_o_no_pendiente' };
  if (r.id_whatsapp) {
    await deps.sender.sendText(r.id_whatsapp, `❌ No pudimos validar tu pago de ${r.plataforma_id}. Motivo: ${motivo || 'comprobante no válido'}. Por favor verifica e inténtalo de nuevo.`);
  }
  logger.info({ pagoId }, 'Pago rechazado');
  return { ok: true };
}
