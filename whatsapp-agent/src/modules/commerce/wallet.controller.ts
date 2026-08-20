/** Billetera: saldo, movimientos y recargas (solicitud del cliente + aprobación admin). */
import type { Request, Response } from 'express';
import { WalletRepository, WalletError } from '../../db/repositories/wallet.repo.js';
import { normalizarMetodoRecarga, METODOS_RECARGA_VALIDOS } from '../../config/payment-methods.js';
import type { AuthedRequest } from '../auth/auth.middleware.js';

export const WalletController = {
  // Cliente: su saldo + últimos movimientos.
  async resumen(req: Request, res: Response): Promise<void> {
    const uid = (req as AuthedRequest).user!.sub;
    const [saldo, movimientos, base] = await Promise.all([
      WalletRepository.saldo(uid),
      WalletRepository.movimientos(uid),
      WalletRepository.estadisticas(uid),
    ]);
    // "Uso del saldo": fracción del dinero disponible este periodo (saldo + gastado)
    // que ya se ha gastado. Sin fondos ni gasto → 0. Acotado a [0, 100].
    const denom = base.gastadoMes + saldo;
    const usoSaldo = denom > 0 ? Math.min(100, Math.round((base.gastadoMes / denom) * 1000) / 10) : 0;
    const stats = { ...base, mostrados: movimientos.length, usoSaldo };
    res.json({ saldo, movimientos, stats });
  },

  // Cliente: solicita una recarga (queda pendiente hasta que el admin la aprueba).
  async solicitarRecarga(req: Request, res: Response): Promise<void> {
    const uid = (req as AuthedRequest).user!.sub;
    const monto = Number(req.body?.monto);
    if (!Number.isFinite(monto) || monto <= 0) { res.status(400).json({ error: 'monto_invalido' }); return; }
    // El método de pago se valida y normaliza a su forma canónica; un valor
    // desconocido (o un alias del frontend) ya no se guarda tal cual.
    const metodoPago = normalizarMetodoRecarga(req.body?.metodo_pago);
    if (!metodoPago) {
      res.status(400).json({ error: 'metodo_invalido', metodos: METODOS_RECARGA_VALIDOS });
      return;
    }
    const recarga = await WalletRepository.crearRecarga({
      uid, monto, metodoPago, comprobante: req.body?.comprobante,
    });
    res.status(201).json({ recarga });
  },

  async misRecargas(req: Request, res: Response): Promise<void> {
    const uid = (req as AuthedRequest).user!.sub;
    res.json({ recargas: await WalletRepository.recargasDeUsuario(uid) });
  },

  // Admin
  async pendientes(_req: Request, res: Response): Promise<void> {
    res.json({ recargas: await WalletRepository.recargasPendientes() });
  },

  async aprobar(req: Request, res: Response): Promise<void> {
    const adminId = (req as AuthedRequest).user!.sub;
    try {
      const r = await WalletRepository.aprobarRecarga(req.params.id || '', adminId);
      res.json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof WalletError) { res.status(409).json({ error: e.code, mensaje: e.message }); return; }
      throw e;
    }
  },

  async rechazar(req: Request, res: Response): Promise<void> {
    const adminId = (req as AuthedRequest).user!.sub;
    const ok = await WalletRepository.rechazarRecarga(req.params.id || '', adminId);
    res.status(ok ? 200 : 409).json({ ok });
  },
};
