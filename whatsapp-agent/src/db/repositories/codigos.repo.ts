/** Repositorio de códigos de verificación (OTP). Portado de las Cloud Functions. */
import { query } from '../pool.js';

export type Codigo = {
  id: string; plataforma_id: string | null; plataforma_nombre: string | null; codigo: string;
  cuenta_madre_id: string | null; cliente_ws: string | null; recibido_via: string | null;
  obsoleto: boolean; notificado: boolean; aviso_wa: string | null; fecha_recepcion: Date;
};

export const CodigosRepository = {
  /** Marca obsoletos los códigos activos de la misma cuenta madre (o plataforma). */
  async marcarObsoletos(cuentaMadreId: string | null, plataformaId: string | null): Promise<void> {
    if (cuentaMadreId) {
      await query(`UPDATE codigos_verificacion SET obsoleto = true WHERE cuenta_madre_id = $1 AND obsoleto = false`, [cuentaMadreId]);
    } else if (plataformaId) {
      await query(`UPDATE codigos_verificacion SET obsoleto = true WHERE plataforma_id = $1 AND obsoleto = false`, [plataformaId]);
    }
  },

  async crear(r: {
    plataformaId: string | null; plataformaNombre: string | null; codigo: string;
    cuentaMadreId?: string | null; clienteWs?: string | null; remitente?: string | null;
    recibidoVia?: string | null; textoOriginal?: string | null;
  }): Promise<Codigo> {
    const rows = await query<Codigo>(
      `INSERT INTO codigos_verificacion
         (plataforma_id, plataforma_nombre, codigo, cuenta_madre_id, cliente_ws, remitente, recibido_via, texto_original)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [r.plataformaId, r.plataformaNombre, r.codigo, r.cuentaMadreId ?? null,
       r.clienteWs ?? null, r.remitente ?? null, r.recibidoVia ?? null, r.textoOriginal ?? null],
    );
    return rows[0]!;
  },

  /** Códigos recientes (para operadores/admin). */
  async recientes(limite = 50): Promise<Codigo[]> {
    return query<Codigo>(
      `SELECT * FROM codigos_verificacion ORDER BY fecha_recepcion DESC LIMIT $1`, [limite]);
  },

  async marcarNotificado(id: string, avisoWa: string | null): Promise<void> {
    await query(`UPDATE codigos_verificacion SET notificado = true, aviso_wa = $1 WHERE id = $2`, [avisoWa, id]);
  },

  /**
   * Resuelve al cliente destinatario a partir de la cuenta madre que recibió el
   * código: correo de la cuenta (o su UUID) → suscripción ACTIVA → teléfono E.164.
   * Como cada cuenta tiene un único perfil/suscripción activa, es inequívoco.
   */
  async destinatarioPorCuenta(cuenta: string): Promise<{ uid: string; telefono: string; cuentaId: string } | null> {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuenta);
    const rows = await query<{ uid: string; telefono: string; cuenta_id: string }>(
      `SELECT u.id AS uid, u.id_whatsapp AS telefono, c.id AS cuenta_id
         FROM suscripciones s
         JOIN cuentas_streaming c ON c.id = s.cuenta_streaming_id
         JOIN usuarios u          ON u.id = s.usuario_id
        WHERE s.estado = 'activa' AND ${esUuid ? 'c.id = $1' : 'lower(c.correo) = lower($1)'}
        ORDER BY s.creado_en DESC
        LIMIT 1`,
      [cuenta],
    );
    const r = rows[0];
    return r && r.telefono ? { uid: r.uid, telefono: r.telefono, cuentaId: r.cuenta_id } : null;
  },
};
