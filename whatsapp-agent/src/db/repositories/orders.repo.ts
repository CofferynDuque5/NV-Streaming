/** Repositorio de Pedidos (compras de servicios). Único lugar que toca `pedidos`. */
import { query } from '../pool.js';

export type Pedido = {
  id: string; uid_cliente: string | null; nombre_cliente: string | null; email_cliente: string | null;
  id_servicio: string; precio: number; metodo_pago: string | null; estado: string;
  comprobante: string | null; notas: string | null; creado_en: Date; actualizado_en: Date;
  suscripcion_id: string | null; provision_estado: string | null;
};

const toPedido = (r: Record<string, unknown>): Pedido => ({
  id: r.id as string, uid_cliente: (r.uid_cliente as string) ?? null,
  nombre_cliente: (r.nombre_cliente as string) ?? null, email_cliente: (r.email_cliente as string) ?? null,
  id_servicio: r.id_servicio as string, precio: Number(r.precio), metodo_pago: (r.metodo_pago as string) ?? null,
  estado: r.estado as string, comprobante: (r.comprobante as string) ?? null, notas: (r.notas as string) ?? null,
  creado_en: r.creado_en as Date, actualizado_en: r.actualizado_en as Date,
  suscripcion_id: (r.suscripcion_id as string) ?? null, provision_estado: (r.provision_estado as string) ?? null,
});

const ESTADOS = new Set(['pendiente', 'aprobado', 'rechazado', 'entregado']);

export const OrdersRepository = {
  async crear(p: {
    uidCliente?: string | null; nombreCliente?: string | null; emailCliente?: string | null;
    idServicio: string; precio: number; metodoPago?: string | null; comprobante?: string | null;
  }): Promise<Pedido> {
    const rows = await query<Record<string, unknown>>(
      `INSERT INTO pedidos (uid_cliente, nombre_cliente, email_cliente, id_servicio, precio, metodo_pago, comprobante)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [p.uidCliente ?? null, p.nombreCliente ?? null, p.emailCliente ?? null,
       p.idServicio, p.precio, p.metodoPago ?? null, p.comprobante ?? null],
    );
    return toPedido(rows[0]!);
  },

  async listar(estado?: string): Promise<Pedido[]> {
    const rows = estado
      ? await query<Record<string, unknown>>(`SELECT * FROM pedidos WHERE estado = $1 ORDER BY creado_en DESC`, [estado])
      : await query<Record<string, unknown>>(`SELECT * FROM pedidos ORDER BY creado_en DESC`);
    return rows.map(toPedido);
  },

  async deUsuario(uid: string): Promise<Pedido[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM pedidos WHERE uid_cliente = $1 ORDER BY creado_en DESC`, [uid]);
    return rows.map(toPedido);
  },

  async obtener(id: string): Promise<Pedido | null> {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM pedidos WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? toPedido(rows[0]) : null;
  },

  async cambiarEstado(id: string, estado: string): Promise<Pedido | null> {
    if (!ESTADOS.has(estado)) return null;
    const rows = await query<Record<string, unknown>>(
      `UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *`, [estado, id]);
    return rows[0] ? toPedido(rows[0]) : null;
  },

  /** Enlaza el pedido con la suscripción aprovisionada y registra el resultado. */
  async marcarAprovisionado(id: string, suscripcionId: string | null, provisionEstado: string): Promise<void> {
    await query(
      `UPDATE pedidos SET suscripcion_id = $2, provision_estado = $3 WHERE id = $1`,
      [id, suscripcionId, provisionEstado],
    );
  },
};

export const ESTADOS_PEDIDO = ESTADOS;
