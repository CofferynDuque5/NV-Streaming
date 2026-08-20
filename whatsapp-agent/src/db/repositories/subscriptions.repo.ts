/**
 * Repositorio de Suscripciones. Provee los datos que las FUNCIONES del agente
 * (Paso 2) necesitan para responder estado/renovaciones, sin exponer SQL a la IA.
 */
import { query, withTransaction } from '../pool.js';
import type { Suscripcion } from '../models.js';

/** Resultado de aprovisionar una compra web (asignar cuenta + crear suscripción). */
export interface ProvisionResultado {
  asignado: boolean;                 // se tomó un perfil libre del inventario
  sin_stock: boolean;                // no había stock → cola de espera
  suscripcion_id: string | null;
  perfil: string | null;
  fecha_vencimiento: Date | null;
}

type SuscripcionRow = {
  id: string;
  usuario_id: string;
  cuenta_streaming_id: string;
  plataforma_id: string;
  plan_id: string;
  estado: Suscripcion['estado'];
  pagada: boolean;
  fecha_inicio: Date;
  fecha_vencimiento: Date;
  renovacion_automatica: boolean;
  creado_en: Date;
  actualizado_en: Date;
};

const toSuscripcion = (r: SuscripcionRow): Suscripcion => ({
  id: r.id,
  usuario_id: r.usuario_id,
  cuenta_streaming_id: r.cuenta_streaming_id,
  plataforma_id: r.plataforma_id,
  plan_id: r.plan_id,
  estado: r.estado,
  pagada: r.pagada,
  fecha_inicio: r.fecha_inicio,
  fecha_vencimiento: r.fecha_vencimiento,
  renovacion_automatica: r.renovacion_automatica,
  creado_en: r.creado_en,
  actualizado_en: r.actualizado_en,
});

export const SubscriptionsRepository = {
  /** Suscripciones activas de un cliente. */
  async findActiveByUser(usuarioId: string): Promise<Suscripcion[]> {
    const rows = await query<SuscripcionRow>(
      `SELECT * FROM suscripciones
       WHERE usuario_id = $1 AND estado = 'activa'
       ORDER BY fecha_vencimiento ASC`,
      [usuarioId],
    );
    return rows.map(toSuscripcion);
  },

  /** Suscripciones activas que vencen dentro de N días (para renovaciones). */
  async findExpiringWithin(dias: number): Promise<Suscripcion[]> {
    const rows = await query<SuscripcionRow>(
      `SELECT * FROM suscripciones
       WHERE estado = 'activa'
         AND fecha_vencimiento <= now() + ($1 || ' days')::interval
       ORDER BY fecha_vencimiento ASC`,
      [String(dias)],
    );
    return rows.map(toSuscripcion);
  },

  /**
   * Vista detallada de suscripciones activas de un cliente, con el plan (precio
   * y nombre vienen de la BD — nunca los inventa la IA). Para `verificarEstadoSuscripcion`.
   */
  async findActiveDetailedByUser(usuarioId: string): Promise<SuscripcionDetallada[]> {
    return query<SuscripcionDetallada>(
      `SELECT s.plataforma_id,
              s.estado,
              s.pagada,
              s.fecha_vencimiento,
              s.renovacion_automatica,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.fecha_vencimiento - now())) / 86400))::int AS dias_restantes,
              c.perfil  AS perfil,
              p.nombre  AS plan_nombre,
              p.precio  AS plan_precio,
              p.moneda  AS plan_moneda
       FROM suscripciones s
       JOIN planes p            ON p.id = s.plan_id
       JOIN cuentas_streaming c ON c.id = s.cuenta_streaming_id
       WHERE s.usuario_id = $1 AND s.estado = 'activa'
       ORDER BY s.fecha_vencimiento ASC`,
      [usuarioId],
    );
  },

  /**
   * Suscripción de un cliente para una plataforma, SIN filtrar por estado, con
   * sus credenciales y plan. La lógica de control (tools.ts) decide si entrega
   * las credenciales (activa + pagada + vigente) o bloquea (vencida / impaga).
   * Devuelve la más reciente; null si el cliente nunca tuvo esa suscripción.
   */
  async findForService(usuarioId: string, plataformaId: string): Promise<SuscripcionServicio | null> {
    const rows = await query<SuscripcionServicio>(
      `SELECT s.id,
              s.plataforma_id,
              s.estado,
              s.pagada,
              s.fecha_vencimiento,
              c.correo,
              c.contrasena_cifrada,
              c.perfil,
              c.pin,
              p.nombre AS plan_nombre,
              p.precio AS plan_precio,
              p.moneda AS plan_moneda
       FROM suscripciones s
       JOIN cuentas_streaming c ON c.id = s.cuenta_streaming_id
       JOIN planes p            ON p.id = s.plan_id
       WHERE s.usuario_id = $1 AND s.plataforma_id = $2
       ORDER BY s.fecha_vencimiento DESC
       LIMIT 1`,
      [usuarioId, plataformaId],
    );
    return rows[0] ?? null;
  },

  /**
   * Aprovisiona una COMPRA WEB (pedido aprobado): asigna atómicamente un perfil
   * libre de la plataforma y crea una suscripción activa. Si no hay stock, deja
   * al cliente en cola de espera y avisa al admin. Mismo patrón de asignación
   * (FOR UPDATE SKIP LOCKED) que la confirmación de pagos, para no entregar la
   * misma cuenta dos veces.
   */
  async provisionarCompra(input: {
    usuarioId: string; plataformaId: string; planId: string; duracionDias: number; pedidoId: string;
  }): Promise<ProvisionResultado> {
    const dur = String(input.duracionDias > 0 ? input.duracionDias : 30);
    return withTransaction(async (q) => {
      const libre = await q<{ id: string; perfil: string }>(
        `SELECT id, perfil FROM cuentas_streaming
         WHERE plataforma_id = $1 AND estado = 'disponible'
         ORDER BY creado_en ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [input.plataformaId],
      );

      if (libre.length) {
        const cuenta = libre[0]!;
        await q(`UPDATE cuentas_streaming SET estado = 'asignada' WHERE id = $1`, [cuenta.id]);
        const ins = await q<{ id: string; fecha_vencimiento: Date }>(
          `INSERT INTO suscripciones
             (usuario_id, cuenta_streaming_id, plataforma_id, plan_id, estado, pagada, fecha_inicio, fecha_vencimiento, renovacion_automatica)
           VALUES ($1, $2, $3, $4, 'activa', TRUE, now(), now() + ($5 || ' days')::interval, FALSE)
           RETURNING id, fecha_vencimiento`,
          [input.usuarioId, cuenta.id, input.plataformaId, input.planId, dur],
        );
        return { asignado: true, sin_stock: false, suscripcion_id: ins[0]!.id, perfil: cuenta.perfil, fecha_vencimiento: ins[0]!.fecha_vencimiento };
      }

      // Sin stock: cola de espera (pago_id NULL: el pago fue por billetera) + alerta.
      await q(`INSERT INTO cola_espera (usuario_id, plataforma_id, plan_id) VALUES ($1, $2, $3)`,
        [input.usuarioId, input.plataformaId, input.planId]);
      await q(`INSERT INTO alertas_admin (tipo, mensaje) VALUES ('sin_stock', $1)`,
        [`Sin stock de ${input.plataformaId}: cliente ${input.usuarioId} en cola de espera (pedido ${input.pedidoId}).`]);
      return { asignado: false, sin_stock: true, suscripcion_id: null, perfil: null, fecha_vencimiento: null };
    });
  },

  /* ─────────────────────  Job de renovaciones (Paso 3)  ───────────────────── */

  /** Suscripciones ACTIVAS ya vencidas (fecha_vencimiento < ahora). */
  async findDueActive(ahora: Date): Promise<SuscripcionCobro[]> {
    return query<SuscripcionCobro>(
      `${COBRO_SELECT}
       WHERE s.estado = 'activa' AND s.fecha_vencimiento < $1
       ORDER BY s.fecha_vencimiento ASC`,
      [ahora],
    );
  },

  /** Suscripciones ACTIVAS no automáticas que vencen dentro de `dias` (aviso). */
  async findExpiringSoon(ahora: Date, dias: number): Promise<SuscripcionCobro[]> {
    return query<SuscripcionCobro>(
      `${COBRO_SELECT}
       WHERE s.estado = 'activa'
         AND s.renovacion_automatica = FALSE
         AND s.fecha_vencimiento >= $1
         AND s.fecha_vencimiento <= $1 + ($2 || ' days')::interval
       ORDER BY s.fecha_vencimiento ASC`,
      [ahora, String(dias)],
    );
  },

  /**
   * Suscripciones ACTIVAS cuyo vencimiento cae EXACTAMENTE dentro de `dias`
   * días (coincidencia por día calendario, no rango). Incluye teléfono, plan y
   * el perfil único privado. Para el cron diario de aviso de vencimiento.
   */
  async findExpiringExactlyInDays(ahora: Date, dias: number): Promise<VencimientoProximo[]> {
    return query<VencimientoProximo>(
      `SELECT s.id,
              s.plataforma_id,
              s.fecha_vencimiento,
              u.id_whatsapp,
              u.nombre AS cliente_nombre,
              c.perfil AS perfil,
              p.nombre AS plan_nombre,
              p.precio AS plan_precio,
              p.moneda AS plan_moneda
       FROM suscripciones s
       JOIN usuarios u          ON u.id = s.usuario_id
       JOIN cuentas_streaming c ON c.id = s.cuenta_streaming_id
       JOIN planes p            ON p.id = s.plan_id
       WHERE s.estado = 'activa'
         AND s.fecha_vencimiento::date = ($1::date + $2::int)
       ORDER BY u.id_whatsapp ASC`,
      [ahora, dias],
    );
  },

  /** Marca como 'vencida' un conjunto de suscripciones. Devuelve cuántas. */
  async markExpired(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await query<{ id: string }>(
      `UPDATE suscripciones SET estado = 'vencida'
       WHERE id = ANY($1::uuid[]) AND estado = 'activa'
       RETURNING id`,
      [ids],
    );
    return rows.length;
  },

  /**
   * Renueva un ciclo: extiende el vencimiento `dias`, marca pagada y activa.
   * ⚠️ En producción debe ejecutarse SOLO tras un cobro exitoso.
   */
  async renovar(id: string, dias: number): Promise<Date | null> {
    const rows = await query<{ fecha_vencimiento: Date }>(
      `UPDATE suscripciones
       SET fecha_vencimiento = GREATEST(fecha_vencimiento, now()) + ($2 || ' days')::interval,
           pagada = TRUE,
           estado = 'activa'
       WHERE id = $1
       RETURNING fecha_vencimiento`,
      [id, String(dias)],
    );
    return rows[0]?.fecha_vencimiento ?? null;
  },
};

// Proyección común para el job (suscripción + cliente + plan).
const COBRO_SELECT = `
  SELECT s.id,
         s.plataforma_id,
         s.renovacion_automatica,
         s.fecha_vencimiento,
         u.id_whatsapp,
         u.nombre AS cliente_nombre,
         p.nombre AS plan_nombre,
         p.precio AS plan_precio,
         p.moneda AS plan_moneda,
         p.duracion_dias AS plan_duracion
  FROM suscripciones s
  JOIN usuarios u ON u.id = s.usuario_id
  JOIN planes  p ON p.id = s.plan_id`;

export interface SuscripcionCobro {
  id: string;
  plataforma_id: string;
  renovacion_automatica: boolean;
  fecha_vencimiento: Date;
  id_whatsapp: string;
  cliente_nombre: string | null;
  plan_nombre: string;
  plan_precio: string;
  plan_moneda: string;
  plan_duracion: number;
}

export interface VencimientoProximo {
  id: string;
  plataforma_id: string;
  fecha_vencimiento: Date;
  id_whatsapp: string;
  cliente_nombre: string | null;
  perfil: string;        // perfil único privado
  plan_nombre: string;
  plan_precio: string;
  plan_moneda: string;
}

export interface SuscripcionDetallada {
  plataforma_id: string;
  estado: Suscripcion['estado'];
  pagada: boolean;
  fecha_vencimiento: Date;
  renovacion_automatica: boolean;
  dias_restantes: number;
  perfil: string;        // perfil único privado asignado
  plan_nombre: string;
  plan_precio: string;   // numeric como string
  plan_moneda: string;
}

export interface SuscripcionServicio {
  id: string;
  plataforma_id: string;
  estado: Suscripcion['estado'];
  pagada: boolean;
  fecha_vencimiento: Date;
  correo: string;
  contrasena_cifrada: string;
  perfil: string;
  pin: string | null;
  plan_nombre: string;
  plan_precio: string;
  plan_moneda: string;
}
