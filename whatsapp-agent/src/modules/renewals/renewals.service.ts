/**
 * renewals.service.ts — Job de renovaciones y vencimientos.
 *
 * En cada ciclo:
 *   1. VENCIDAS: suscripciones activas cuya fecha ya pasó.
 *      · con renovación automática → renueva el ciclo (⚠️ tras cobro en prod) y avisa.
 *      · sin renovación automática → marca 'vencida' y guía al pago.
 *   2. POR VENCER: activas (no automáticas) que vencen dentro de `dias` → recordatorio.
 *
 * Dependencias inyectables (repos + sender + reloj) para testear sin red ni BD.
 * Los precios provienen SIEMPRE de la BD (plan), nunca se inventan.
 */
import { logger } from '../../utils/logger.js';
import { SubscriptionsRepository, type SuscripcionCobro } from '../../db/repositories/subscriptions.repo.js';
import { whatsappSender, type Sender } from '../../services/whatsapp.service.js';

export interface RenewalDeps {
  subs: {
    findDueActive(ahora: Date): Promise<SuscripcionCobro[]>;
    findExpiringSoon(ahora: Date, dias: number): Promise<SuscripcionCobro[]>;
    markExpired(ids: string[]): Promise<number>;
    renovar(id: string, dias: number): Promise<Date | null>;
  };
  sender: Sender;
  now?: () => Date;
}

export const defaultRenewalDeps: RenewalDeps = {
  subs: SubscriptionsRepository,
  sender: whatsappSender,
};

export interface RenewalReport {
  vencidas: number;
  renovadas: number;
  recordatorios: number;
}

/* ─────────────────────────  Plantillas de mensaje  ───────────────────────── */
const money = (s: SuscripcionCobro) => `${s.plan_precio} ${s.plan_moneda}`;
const nombre = (s: SuscripcionCobro) => s.cliente_nombre ?? 'Hola';

const msgVencida = (s: SuscripcionCobro) =>
  `${nombre(s)} 👋, tu suscripción de ${s.plan_nombre} venció. Para reactivar tu acceso, renueva por ${money(s)}. ` +
  `Responde "PAGAR" y te indico cómo, o escribe "ASESOR" para ayuda humana.`;

const msgRenovada = (s: SuscripcionCobro, hasta: Date | null) =>
  `${nombre(s)} ✅ Renovamos tu ${s.plan_nombre} automáticamente` +
  (hasta ? ` hasta el ${hasta.toISOString().slice(0, 10)}.` : '.') +
  ` ¡Gracias por seguir con NV Stream!`;

const msgPorVencer = (s: SuscripcionCobro) =>
  `${nombre(s)} ⏳ Tu ${s.plan_nombre} vence el ${s.fecha_vencimiento.toISOString().slice(0, 10)}. ` +
  `Renueva a tiempo por ${money(s)} para no perder el acceso. Responde "PAGAR" cuando quieras.`;

/* ─────────────────────────────  Ciclo  ───────────────────────────── */
export async function runRenewalCycle(dias = 3, deps: RenewalDeps = defaultRenewalDeps): Promise<RenewalReport> {
  const ahora = (deps.now ?? (() => new Date()))();
  const report: RenewalReport = { vencidas: 0, renovadas: 0, recordatorios: 0 };

  // 1. Vencidas.
  const due = await deps.subs.findDueActive(ahora);
  const expirarIds: string[] = [];
  for (const s of due) {
    if (s.renovacion_automatica) {
      // ⚠️ En producción: cobrar ANTES de renovar. Aquí se extiende el ciclo.
      const hasta = await deps.subs.renovar(s.id, s.plan_duracion);
      await deps.sender.sendText(s.id_whatsapp, msgRenovada(s, hasta));
      report.renovadas++;
    } else {
      expirarIds.push(s.id);
      await deps.sender.sendText(s.id_whatsapp, msgVencida(s));
    }
  }
  report.vencidas = await deps.subs.markExpired(expirarIds);

  // 2. Por vencer (recordatorio de pago).
  const soon = await deps.subs.findExpiringSoon(ahora, dias);
  for (const s of soon) {
    await deps.sender.sendText(s.id_whatsapp, msgPorVencer(s));
    report.recordatorios++;
  }

  logger.info(report, 'Ciclo de renovaciones completado');
  return report;
}
