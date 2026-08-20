/**
 * Repositorio de Pagos. La confirmación renueva la suscripción de forma ATÓMICA
 * (una transacción): marca el pago confirmado, marca la suscripción `pagada` y
 * extiende su vencimiento. Así se cierra el ciclo de renovación sin condiciones
 * de carrera.
 */
import { query, withTransaction } from '../pool.js';
import type { Pago, MetodoPago } from '../models.js';

type PagoRow = Pago;

const toPago = (r: PagoRow): Pago => ({ ...r });

export interface CrearPagoInput {
  usuario_id: string;
  suscripcion_id: string | null;
  plataforma_id: string;
  plan_id: string;
  metodo: MetodoPago;
  monto: string;
  moneda: string;
  referencia: string | null;
  comprobante_url: string | null;
}

/** Info devuelta tras confirmar, para notificar al cliente. */
export interface ConfirmacionResultado {
  pago_id: string;
  usuario_id: string;
  id_whatsapp: string;
  email: string | null;
  cliente_nombre: string | null;
  plataforma_id: string;
  plan_nombre: string;
  monto: string;
  moneda: string;
  metodo: string;
  suscripcion_id: string | null;
  nueva_fecha_vencimiento: Date | null;
  perfil: string | null;   // perfil único asignado (compra nueva o renovación)
  asignado: boolean;       // true si se asignó un perfil nuevo del inventario
  sin_stock: boolean;      // true si no había stock → cola de espera
}

export const PaymentsRepository = {
  async create(input: CrearPagoInput): Promise<Pago> {
    const rows = await query<PagoRow>(
      `INSERT INTO pagos (usuario_id, suscripcion_id, plataforma_id, plan_id, metodo, monto, moneda, referencia, comprobante_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [input.usuario_id, input.suscripcion_id, input.plataforma_id, input.plan_id, input.metodo, input.monto, input.moneda, input.referencia, input.comprobante_url],
    );
    return toPago(rows[0]!);
  },

  async findById(id: string): Promise<Pago | null> {
    const rows = await query<PagoRow>(`SELECT * FROM pagos WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? toPago(rows[0]) : null;
  },

  /** Pago PENDIENTE más reciente con esa referencia (para el webhook del PSP). */
  async findPendingByReferencia(referencia: string): Promise<Pago | null> {
    const rows = await query<PagoRow>(
      `SELECT * FROM pagos WHERE referencia = $1 AND estado = 'pendiente'
       ORDER BY creado_en DESC LIMIT 1`,
      [referencia],
    );
    return rows[0] ? toPago(rows[0]) : null;
  },

  /** ¿Ya se procesó esta transacción del PSP? (idempotencia por id_externo). */
  async externalAlreadyProcessed(idExterno: string): Promise<boolean> {
    const rows = await query<{ id: string }>(`SELECT id FROM pagos WHERE id_externo = $1 LIMIT 1`, [idExterno]);
    return rows.length > 0;
  },

  /** Registra la correlación con el PSP (proveedor + id de transacción). */
  async markExternalSeen(pagoId: string, proveedor: string, idExterno: string): Promise<void> {
    await query(`UPDATE pagos SET proveedor = $2, id_externo = $3 WHERE id = $1`, [pagoId, proveedor, idExterno]);
  },

  async listPending(): Promise<Pago[]> {
    const rows = await query<PagoRow>(`SELECT * FROM pagos WHERE estado = 'pendiente' ORDER BY creado_en ASC`);
    return rows.map(toPago);
  },

  /**
   * Confirma un pago PENDIENTE y renueva su suscripción en una sola transacción.
   * Devuelve null si el pago no existe o ya no está pendiente (idempotente).
   */
  async confirmAndRenew(pagoId: string, adminId: string): Promise<ConfirmacionResultado | null> {
    return withTransaction(async (q) => {
      // 1. Confirmar el pago solo si está pendiente (bloquea doble confirmación).
      const pagoRows = await q<{ usuario_id: string; suscripcion_id: string | null; plataforma_id: string; plan_id: string; monto: string; moneda: string; metodo: string }>(
        `UPDATE pagos SET estado = 'confirmado', confirmado_por = $2, confirmado_en = now()
         WHERE id = $1 AND estado = 'pendiente'
         RETURNING usuario_id, suscripcion_id, plataforma_id, plan_id, monto, moneda, metodo`,
        [pagoId, adminId],
      );
      if (pagoRows.length === 0) return null; // inexistente o ya procesado
      const pago = pagoRows[0]!;

      // 2. Datos del cliente y del plan (duración para extender + correo/nombre).
      const infoRows = await q<{ id_whatsapp: string; email: string | null; nombre: string | null; plan_nombre: string; duracion_dias: number }>(
        `SELECT u.id_whatsapp, u.email, u.nombre, p.nombre AS plan_nombre, p.duracion_dias
         FROM usuarios u, planes p
         WHERE u.id = $1 AND p.id = $2`,
        [pago.usuario_id, pago.plan_id],
      );
      const info = infoRows[0];
      const dur = String(info?.duracion_dias ?? 30);

      let nuevaFecha: Date | null = null;
      let perfil: string | null = null;
      let suscripcionId: string | null = pago.suscripcion_id;
      let asignado = false;
      let sinStock = false;

      if (pago.suscripcion_id) {
        // 3.a RENOVACIÓN: extiende la suscripción existente.
        const susRows = await q<{ fecha_vencimiento: Date; cuenta_streaming_id: string }>(
          `UPDATE suscripciones
           SET pagada = TRUE, estado = 'activa',
               fecha_vencimiento = GREATEST(fecha_vencimiento, now()) + ($2 || ' days')::interval,
               actualizado_en = now()
           WHERE id = $1
           RETURNING fecha_vencimiento, cuenta_streaming_id`,
          [pago.suscripcion_id, dur],
        );
        nuevaFecha = susRows[0]?.fecha_vencimiento ?? null;
        if (susRows[0]?.cuenta_streaming_id) {
          const c = await q<{ perfil: string }>(`SELECT perfil FROM cuentas_streaming WHERE id = $1`, [susRows[0].cuenta_streaming_id]);
          perfil = c[0]?.perfil ?? null;
        }
      } else {
        // 3.b COMPRA NUEVA: asigna un perfil libre de forma ATÓMICA.
        // FOR UPDATE SKIP LOCKED evita que dos pagos tomen la misma cuenta.
        const libre = await q<{ id: string; perfil: string }>(
          `SELECT id, perfil FROM cuentas_streaming
           WHERE plataforma_id = $1 AND estado = 'disponible'
           ORDER BY creado_en ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [pago.plataforma_id],
        );

        if (libre.length) {
          const cuenta = libre[0]!;
          await q(`UPDATE cuentas_streaming SET estado = 'asignada' WHERE id = $1`, [cuenta.id]);
          const ins = await q<{ id: string; fecha_vencimiento: Date }>(
            `INSERT INTO suscripciones (usuario_id, cuenta_streaming_id, plataforma_id, plan_id, estado, pagada, fecha_inicio, fecha_vencimiento, renovacion_automatica)
             VALUES ($1, $2, $3, $4, 'activa', TRUE, now(), now() + ($5 || ' days')::interval, FALSE)
             RETURNING id, fecha_vencimiento`,
            [pago.usuario_id, cuenta.id, pago.plataforma_id, pago.plan_id, dur],
          );
          suscripcionId = ins[0]!.id;
          nuevaFecha = ins[0]!.fecha_vencimiento;
          perfil = cuenta.perfil;
          asignado = true;
          await q(`UPDATE pagos SET suscripcion_id = $2 WHERE id = $1`, [pagoId, suscripcionId]);
        } else {
          // 3.c SIN STOCK: cola de espera + alerta al administrador.
          sinStock = true;
          await q(`INSERT INTO cola_espera (usuario_id, plataforma_id, plan_id, pago_id) VALUES ($1, $2, $3, $4)`,
            [pago.usuario_id, pago.plataforma_id, pago.plan_id, pagoId]);
          await q(`INSERT INTO alertas_admin (tipo, mensaje) VALUES ('sin_stock', $1)`,
            [`Sin stock de ${pago.plataforma_id}: ${info?.email ?? pago.usuario_id} en cola de espera (pago ${pagoId}).`]);
        }
      }

      return {
        pago_id: pagoId,
        usuario_id: pago.usuario_id,
        id_whatsapp: info?.id_whatsapp ?? '',
        email: info?.email ?? null,
        cliente_nombre: info?.nombre ?? null,
        plataforma_id: pago.plataforma_id,
        plan_nombre: info?.plan_nombre ?? '',
        monto: pago.monto,
        moneda: pago.moneda,
        metodo: pago.metodo,
        suscripcion_id: suscripcionId,
        nueva_fecha_vencimiento: nuevaFecha,
        perfil,
        asignado,
        sin_stock: sinStock,
      };
    });
  },

  /** Rechaza un pago pendiente. Devuelve el teléfono para notificar, o null. */
  async reject(pagoId: string, adminId: string, motivo: string): Promise<{ id_whatsapp: string; plataforma_id: string } | null> {
    const rows = await query<{ id_whatsapp: string; plataforma_id: string }>(
      `UPDATE pagos p SET estado = 'rechazado', motivo_rechazo = $3, confirmado_por = $2, confirmado_en = now()
       FROM usuarios u
       WHERE p.id = $1 AND p.estado = 'pendiente' AND u.id = p.usuario_id
       RETURNING u.id_whatsapp, p.plataforma_id`,
      [pagoId, adminId, motivo],
    );
    return rows[0] ?? null;
  },
};
