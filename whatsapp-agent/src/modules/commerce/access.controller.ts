/**
 * access.controller.ts — "Mis accesos": lo que el cliente REALMENTE tiene.
 *
 *   GET /api/mis/accesos  (cliente con sesión)
 *
 * Devuelve sus suscripciones con la cuenta asignada. La contraseña se descifra
 * SOLO si la suscripción está activa, pagada y vigente (misma regla que el
 * agente de WhatsApp en tools.ts); si no, viaja `credenciales: null` con el
 * motivo. Además lista sus pedidos (pendientes de validación / rechazados /
 * aprobados sin cuenta) y sus entradas en cola de espera, para que "Mi cuenta"
 * muestre el estado real de cada compra, de punta a punta.
 */
import type { Request, Response } from 'express';
import { SubscriptionsRepository } from '../../db/repositories/subscriptions.repo.js';
import { OrdersRepository } from '../../db/repositories/orders.repo.js';
import { decrypt } from '../../utils/crypto.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

export const AccessController = {
  async mios(req: Request, res: Response): Promise<void> {
    const user = (req as AuthedRequest).user!;
    const ahora = Date.now();
    const [filas, cola, pedidos] = await Promise.all([
      SubscriptionsRepository.accesosDeUsuario(user.sub),
      SubscriptionsRepository.colaDeUsuario(user.sub),
      OrdersRepository.deUsuario(user.sub),
    ]);

    const accesos = filas.map((s) => {
      const venc = s.fecha_vencimiento instanceof Date ? s.fecha_vencimiento : new Date(s.fecha_vencimiento);
      const vigente = venc.getTime() > ahora;
      const entregable = s.estado === 'activa' && s.pagada === true && vigente;
      const motivo = entregable ? null
        : s.estado === 'cancelada' ? 'suscripcion_cancelada'
        : s.estado === 'pausada' ? 'suscripcion_pausada'
        : (!vigente || s.estado === 'vencida') ? 'suscripcion_vencida'
        : !s.pagada ? 'pago_pendiente' : 'suscripcion_no_activa';
      const contrasena = entregable ? decrypt(s.contrasena_cifrada) : null;
      return {
        id: s.id,
        pedido_id: s.pedido_id,
        plataforma_id: s.plataforma_id,
        plan: s.plan_nombre,
        precio: Number(s.plan_precio),
        moneda: s.plan_moneda,
        duracion_dias: Number(s.plan_duracion_dias) || 30,
        estado: s.estado,
        pagada: s.pagada,
        vigente,
        inicio: s.fecha_inicio,
        vence: venc,
        renovacion_automatica: s.renovacion_automatica,
        perfil: s.perfil,
        motivo,
        credenciales: entregable && contrasena !== null ? { correo: s.correo, contrasena, perfil: s.perfil, pin: s.pin } : null,
      };
    });

    res.json({
      accesos,
      cola_espera: cola.filter((c) => c.estado === 'esperando'),
      pedidos: pedidos.map((p) => ({
        id: p.id, id_servicio: p.id_servicio, precio: p.precio, metodo_pago: p.metodo_pago, estado: p.estado,
        provision_estado: p.provision_estado, suscripcion_id: p.suscripcion_id, creado_en: p.creado_en, actualizado_en: p.actualizado_en,
      })),
    });
  },
};
