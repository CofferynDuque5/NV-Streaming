/**
 * Pedidos. El PRECIO lo fija el servidor (lo busca en el catálogo del CMS), no
 * el cliente — así nadie compra a un precio manipulado. Pagar con billetera
 * debita el saldo de forma atómica.
 */
import type { Request, Response } from 'express';
import { OrdersRepository } from '../../db/repositories/orders.repo.js';
import { CmsRepository } from '../../db/repositories/cms.repo.js';
import { WalletRepository, WalletError } from '../../db/repositories/wallet.repo.js';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { provisionarPedido } from './provisioning.service.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

async function precioDeServicio(idServicio: string): Promise<number | null> {
  const doc = await CmsRepository.obtener('servicios_sistema', idServicio);
  if (!doc) return null;
  const p = Number((doc as { precio?: unknown }).precio);
  return Number.isFinite(p) && p >= 0 ? p : null;
}

export const OrdersController = {
  // Cliente crea un pedido. Precio del servidor; método de pago del cliente.
  async crear(req: Request, res: Response): Promise<void> {
    const user = (req as AuthedRequest).user!;
    const body = (req.body || {}) as { id_servicio?: string; metodo_pago?: string; comprobante?: string; telefono?: string };
    const idServicio = (body.id_servicio || '').trim();
    if (!idServicio) { res.status(400).json({ error: 'id_servicio_requerido' }); return; }
    const precio = await precioDeServicio(idServicio);
    if (precio === null) { res.status(400).json({ error: 'servicio_no_encontrado' }); return; }

    // Guarda el WhatsApp del cliente (si lo trae el checkout y aún no tenía). Se
    // hace al CREAR el pedido para que también aplique cuando el pago no es por
    // billetera y lo aprueba el admin después. E.164 sin '+', 8–15 dígitos.
    const tel = String(body.telefono ?? '').replace(/\D/g, '');
    if (tel.length >= 8 && tel.length <= 15) {
      await UsersRepository.setWhatsappIfEmpty(user.sub, tel);
    }

    const pedido = await OrdersRepository.crear({
      uidCliente: user.sub, emailCliente: user.email, idServicio,
      precio, metodoPago: body.metodo_pago ?? null, comprobante: body.comprobante ?? null,
    });

    // Pago con billetera → debita atómicamente y aprueba el pedido.
    if (body.metodo_pago === 'billetera') {
      try {
        const saldo = await WalletRepository.debitar(user.sub, precio, `Compra ${idServicio}`, pedido.id);
        const aprobado = await OrdersRepository.cambiarEstado(pedido.id, 'aprobado');
        // Pedido aprobado → aprovisiona (asigna cuenta + crea suscripción activa).
        // Pago con billetera = reembolsable: si no hay stock, se devuelve el saldo.
        const provision = aprobado ? await provisionarPedido(aprobado, { telefono: body.telefono ?? null, reembolsable: true }) : null;
        if (provision && provision.estado === 'sin_stock') {
          // Sin stock: no se entregó nada → reembolsamos el saldo y cancelamos.
          const saldoReembolsado = await WalletRepository.acreditar(user.sub, precio, `Reembolso (sin stock): ${idServicio}`, pedido.id);
          const rechazado = await OrdersRepository.cambiarEstado(pedido.id, 'rechazado');
          res.status(200).json({ pedido: rechazado, saldo: saldoReembolsado, provision, reembolsado: true });
          return;
        }
        res.status(201).json({ pedido: aprobado, saldo, provision });
        return;
      } catch (e) {
        await OrdersRepository.cambiarEstado(pedido.id, 'rechazado');
        if (e instanceof WalletError && e.code === 'saldo_insuficiente') {
          res.status(402).json({ error: 'saldo_insuficiente', mensaje: e.message, pedido_id: pedido.id });
          return;
        }
        throw e;
      }
    }
    res.status(201).json({ pedido });
  },

  async mios(req: Request, res: Response): Promise<void> {
    const user = (req as AuthedRequest).user!;
    res.json({ pedidos: await OrdersRepository.deUsuario(user.sub) });
  },

  // Admin
  async listar(req: Request, res: Response): Promise<void> {
    const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
    res.json({ pedidos: await OrdersRepository.listar(estado) });
  },

  async cambiarEstado(req: Request, res: Response): Promise<void> {
    const estado = (req.body?.estado || '').trim();
    const pedido = await OrdersRepository.cambiarEstado(req.params.id || '', estado);
    if (!pedido) { res.status(400).json({ error: 'estado_o_pedido_invalido' }); return; }
    // Al aprobar desde el back office también se aprovisiona (idempotente).
    const provision = estado === 'aprobado' ? await provisionarPedido(pedido) : null;
    res.json({ pedido, provision });
  },
};
