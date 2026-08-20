/**
 * expiry-reminder.service.ts — Aviso de vencimiento a EXACTAMENTE N días.
 *
 * Busca las suscripciones activas que vencen justo dentro de `dias` días y envía
 * un **Template Message** de WhatsApp a cada cliente, avisando del próximo
 * vencimiento de su perfil privado. Se ejecuta a diario desde el cron.
 *
 * Parámetros del template (body {{1}}..{{5}}), en este orden:
 *   {{1}} nombre del cliente
 *   {{2}} servicio (plan)
 *   {{3}} perfil privado
 *   {{4}} días restantes
 *   {{5}} fecha de vencimiento (YYYY-MM-DD)
 *
 * Dependencias inyectables (repo + sender de plantillas + reloj + config).
 */
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { SubscriptionsRepository, type VencimientoProximo } from '../../db/repositories/subscriptions.repo.js';
import { whatsappSender, type TemplateSender } from '../../services/whatsapp.service.js';

export interface ReminderDeps {
  subs: { findExpiringExactlyInDays(ahora: Date, dias: number): Promise<VencimientoProximo[]> };
  sender: TemplateSender;
  now?: () => Date;
  templateName?: string;
  languageCode?: string;
}

export const defaultReminderDeps: ReminderDeps = {
  subs: SubscriptionsRepository,
  sender: whatsappSender,
};

export interface ReminderReport {
  encontradas: number;
  enviadas: number;
  fallidas: number;
}

/** Construye los parámetros del cuerpo del template para una suscripción. */
export function buildTemplateParams(s: VencimientoProximo, dias: number): string[] {
  return [
    s.cliente_nombre ?? 'cliente',
    s.plan_nombre,
    s.perfil,
    String(dias),
    s.fecha_vencimiento.toISOString().slice(0, 10),
  ];
}

export async function runExpiryReminders(dias = env.REMINDER_DIAS_ANTES, deps: ReminderDeps = defaultReminderDeps): Promise<ReminderReport> {
  const ahora = (deps.now ?? (() => new Date()))();
  const templateName = deps.templateName ?? env.WHATSAPP_TEMPLATE_VENCIMIENTO;
  const lang = deps.languageCode ?? env.WHATSAPP_TEMPLATE_LANG;

  const proximas = await deps.subs.findExpiringExactlyInDays(ahora, dias);
  const report: ReminderReport = { encontradas: proximas.length, enviadas: 0, fallidas: 0 };

  for (const s of proximas) {
    const params = buildTemplateParams(s, dias);
    const res = await deps.sender.sendTemplate(s.id_whatsapp, templateName, lang, params);
    if (res) report.enviadas++; else report.fallidas++;
  }

  logger.info({ ...report, dias }, 'Avisos de vencimiento (template) procesados');
  return report;
}
