/**
 * provisioning.service.ts — Puente compra web → entrega de streaming.
 *
 * Cuando un PEDIDO web queda 'aprobado' (pago con billetera o aprobación del
 * admin), aquí lo convertimos en algo entregable: asignamos una cuenta de
 * streaming disponible y creamos una SUSCRIPCIÓN activa en el dominio de
 * streaming (el mismo que alimenta el OTP y las renovaciones). Es idempotente:
 * un pedido ya aprovisionado no se vuelve a procesar.
 *
 * Requisito de datos: el servicio del catálogo (CMS `servicios_sistema/{id}`)
 * debe declarar `plataforma_id` (y opcionalmente `plan_id`/`duracion_dias`) para
 * ser aprovisionable. Si no lo declara, el pedido se marca 'no_aplica' (p.ej.
 * productos que no son de streaming) sin romper la compra.
 */
import { CmsRepository } from '../../db/repositories/cms.repo.js';
import { PlansRepository } from '../../db/repositories/plans.repo.js';
import { SubscriptionsRepository, type ProvisionResultado } from '../../db/repositories/subscriptions.repo.js';
import { OrdersRepository, type Pedido } from '../../db/repositories/orders.repo.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { whatsappSender } from '../../services/whatsapp.service.js';
import { logger } from '../../utils/logger.js';

export interface ProvisionInfo {
  provisionado: boolean;                 // se asignó un perfil (entregable ya)
  estado: string;                        // asignado | cola_espera | sin_plan | no_aplica | ya_aprovisionado
  suscripcionId: string | null;
  perfil: string | null;
}

const campo = (doc: Record<string, unknown> | null, ...claves: string[]): string => {
  if (!doc) return '';
  for (const k of claves) { const v = doc[k]; if (v != null && String(v).trim()) return String(v).trim(); }
  return '';
};

function normalizarTel(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Aprovisiona un pedido aprobado. Nunca lanza: los fallos se registran y devuelven estado. */
export async function provisionarPedido(pedido: Pedido, opts: { telefono?: string | null } = {}): Promise<ProvisionInfo> {
  try {
    // Idempotencia: ya enlazado a una suscripción → no repetir.
    if (pedido.suscripcion_id) {
      return { provisionado: true, estado: pedido.provision_estado || 'ya_aprovisionado', suscripcionId: pedido.suscripcion_id, perfil: null };
    }
    if (!pedido.uid_cliente) return marcar(pedido, null, 'no_aplica');

    const doc = await CmsRepository.obtener('servicios_sistema', pedido.id_servicio) as Record<string, unknown> | null;
    const plataformaId = campo(doc, 'plataforma_id', 'plataformaId');
    if (!plataformaId) return marcar(pedido, null, 'no_aplica'); // servicio no ligado a streaming

    // Plan: el declarado por el servicio, o el plan activo de la plataforma.
    let planId = campo(doc, 'plan_id', 'planId');
    let duracion = Number(campo(doc, 'duracion_dias', 'duracionDias')) || 0;
    if (!planId) {
      const plan = await PlansRepository.findActiveByPlatform(plataformaId);
      if (!plan) return marcar(pedido, null, 'sin_plan'); // no hay plan para esa plataforma
      planId = plan.id; duracion = duracion || plan.duracion_dias;
    } else if (!duracion) {
      const plan = await PlansRepository.findById(planId);
      duracion = plan?.duracion_dias || 30;
    }

    // Si el checkout trajo un teléfono y el cliente aún no tenía, lo fijamos
    // (necesario para que el OTP/avisos puedan alcanzarlo).
    const tel = normalizarTel(opts.telefono);
    if (tel) await UsersRepository.setWhatsappIfEmpty(pedido.uid_cliente, tel);

    const r = await SubscriptionsRepository.provisionarCompra({
      usuarioId: pedido.uid_cliente, plataformaId, planId, duracionDias: duracion, pedidoId: pedido.id,
    });
    const estado = r.sin_stock ? 'cola_espera' : 'asignado';
    await OrdersRepository.marcarAprovisionado(pedido.id, r.suscripcion_id, estado);
    await notificar(pedido, plataformaId, r, tel);
    logger.info({ pedidoId: pedido.id, plataformaId, estado, suscripcionId: r.suscripcion_id }, 'Pedido aprovisionado');
    return { provisionado: r.asignado, estado, suscripcionId: r.suscripcion_id, perfil: r.perfil };
  } catch (e) {
    logger.error({ e, pedidoId: pedido.id }, 'fallo al aprovisionar pedido');
    return { provisionado: false, estado: 'error', suscripcionId: null, perfil: null };
  }
}

async function marcar(pedido: Pedido, suscripcionId: string | null, estado: string): Promise<ProvisionInfo> {
  try { await OrdersRepository.marcarAprovisionado(pedido.id, suscripcionId, estado); } catch { /* no crítico */ }
  return { provisionado: false, estado, suscripcionId, perfil: null };
}

/** Aviso best-effort al cliente por WhatsApp (si tenemos su teléfono). */
async function notificar(pedido: Pedido, plataformaId: string, r: ProvisionResultado, tel: string | null): Promise<void> {
  if (!tel) return; // sin teléfono no hay a quién avisar (queda la alerta admin / back office)
  const texto = r.sin_stock
    ? `✅ Recibimos tu compra de ${plataformaId}. Ahora mismo no hay stock, así que quedaste en LISTA DE ESPERA por orden de llegada. Te activamos y avisamos apenas se libere un perfil. 🙏 — NV Streaming`
    : `✅ ¡Tu ${plataformaId} está activo!${r.perfil ? ` Perfil asignado: ${r.perfil}.` : ''} Escríbenos "mis datos de ${plataformaId}" para recibir tu acceso. — NV Streaming`;
  try { await whatsappSender.sendText(tel, texto); } catch (e) { logger.warn({ e }, 'no se pudo notificar aprovisionamiento por WhatsApp'); }
}
