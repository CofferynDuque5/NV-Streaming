/**
 * queue.service.ts — Atiende la COLA DE ESPERA cuando entra stock.
 *
 * Cuando el admin carga una cuenta nueva (inventario) para una plataforma, el
 * cliente más antiguo que esperaba esa plataforma recibe su perfil: se asigna
 * la cuenta, se crea la suscripción activa, se enlaza su pedido (si venía de la
 * web), se marca la entrada de cola como atendida y se le avisa por WhatsApp.
 * Se repite mientras haya stock y gente esperando. Nunca lanza.
 */
import { query, withTransaction } from '../../db/pool.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { whatsappSender } from '../../services/whatsapp.service.js';
import { logger } from '../../utils/logger.js';

interface Atendido { colaId: string; usuarioId: string; suscripcionId: string; perfil: string; pedidoId: string | null }

async function atenderUno(plataformaId: string): Promise<Atendido | null> {
  return withTransaction(async (q) => {
    const esperando = await q<{ id: string; usuario_id: string; plan_id: string }>(
      `SELECT id, usuario_id, plan_id FROM cola_espera
       WHERE plataforma_id = $1 AND estado = 'esperando'
       ORDER BY creado_en ASC FOR UPDATE SKIP LOCKED LIMIT 1`, [plataformaId]);
    if (!esperando.length) return null;
    const libre = await q<{ id: string; perfil: string }>(
      `SELECT id, perfil FROM cuentas_streaming
       WHERE plataforma_id = $1 AND estado = 'disponible'
       ORDER BY creado_en ASC FOR UPDATE SKIP LOCKED LIMIT 1`, [plataformaId]);
    if (!libre.length) return null;
    const c = esperando[0]!, cuenta = libre[0]!;
    const dur = await q<{ duracion_dias: number }>(`SELECT duracion_dias FROM planes WHERE id = $1`, [c.plan_id]);
    const dias = String(dur[0]?.duracion_dias || 30);
    await q(`UPDATE cuentas_streaming SET estado = 'asignada' WHERE id = $1`, [cuenta.id]);
    const ins = await q<{ id: string }>(
      `INSERT INTO suscripciones (usuario_id, cuenta_streaming_id, plataforma_id, plan_id, estado, pagada, fecha_inicio, fecha_vencimiento, renovacion_automatica)
       VALUES ($1, $2, $3, $4, 'activa', TRUE, now(), now() + ($5 || ' days')::interval, FALSE) RETURNING id`,
      [c.usuario_id, cuenta.id, plataformaId, c.plan_id, dias]);
    await q(`UPDATE cola_espera SET estado = 'atendido', atendido_en = now() WHERE id = $1`, [c.id]);
    // Enlaza el pedido web que quedó en cola (el más antiguo sin suscripción).
    const ped = await q<{ id: string }>(
      `UPDATE pedidos SET suscripcion_id = $1, provision_estado = 'asignado'
       WHERE id = (SELECT id FROM pedidos WHERE uid_cliente = $2 AND id_servicio = $3 AND suscripcion_id IS NULL
                   AND provision_estado = 'cola_espera' ORDER BY creado_en ASC LIMIT 1)
       RETURNING id`, [ins[0]!.id, c.usuario_id, plataformaId]);
    return { colaId: c.id, usuarioId: c.usuario_id, suscripcionId: ins[0]!.id, perfil: cuenta.perfil, pedidoId: ped[0]?.id ?? null };
  });
}

/** Atiende la cola de una plataforma mientras haya stock. Devuelve cuántos se activaron. */
export async function atenderColaEspera(plataformaId: string): Promise<number> {
  let n = 0;
  try {
    for (let i = 0; i < 50; i++) {
      const a = await atenderUno(plataformaId);
      if (!a) break;
      n++;
      logger.info({ plataformaId, ...a }, 'Cola de espera atendida: perfil asignado');
      try { await query(`INSERT INTO alertas_admin (tipo, mensaje) VALUES ('cola_atendida', $1)`, [`Lista de espera de ${plataformaId}: perfil ${a.perfil} asignado al cliente ${a.usuarioId}${a.pedidoId ? ` (pedido ${a.pedidoId})` : ''}.`]); } catch { /* no crítico */ }
      try {
        const u = await UsersRepository.findById(a.usuarioId);
        const tel = String(u?.id_whatsapp ?? '').replace(/\D/g, '');
        if (tel.length >= 8) await whatsappSender.sendText(tel, `✅ ¡Ya hay stock! Tu ${plataformaId} quedó activo (perfil ${a.perfil}). Tus datos de acceso están en la web (Mi cuenta → Mis servicios) o escríbenos "mis datos de ${plataformaId}". — NV Streaming`);
      } catch (e) { logger.warn({ e }, 'no se pudo avisar por WhatsApp al atender la cola'); }
    }
  } catch (e) {
    logger.error({ e, plataformaId }, 'fallo al atender la cola de espera');
  }
  return n;
}

/** Util para el back office: cuántos esperan por plataforma. */
export async function esperandoPor(plataformaId: string): Promise<number> {
  const r = await query<{ n: string }>(`SELECT count(*)::text AS n FROM cola_espera WHERE plataforma_id = $1 AND estado = 'esperando'`, [plataformaId]);
  return Number(r[0]?.n || 0);
}
