/**
 * admin.controller.ts — Panel de administración (solo admin).
 * Expone un resumen REAL del negocio para el Back Office.
 */
import type { Request, Response } from 'express';
import { ValidationError } from '../../core/errors.js';
import { AdminRepository } from '../../db/repositories/admin.repo.js';

export const AdminController = {
  async overview(_req: Request, res: Response): Promise<void> {
    const resumen = await AdminRepository.overview();
    res.json({ resumen });
  },

  async tablas(_req: Request, res: Response): Promise<void> {
    const datos = await AdminRepository.tablas();
    res.json({ datos });
  },

  async revendedores(_req: Request, res: Response): Promise<void> {
    const revendedores = await AdminRepository.revendedores();
    res.json({ revendedores });
  },

  async actualizarUsuario(req: Request, res: Response): Promise<void> {
    const id = String(req.params.id || '');
    if (!id) throw new ValidationError('Falta el id del usuario');
    const b = (req.body || {}) as Record<string, unknown>;
    const patch: { rol?: string; saldoBilletera?: number; comisionPct?: number } = {};
    if (typeof b.rol === 'string') patch.rol = b.rol;
    if (b.saldoBilletera != null) patch.saldoBilletera = Number(b.saldoBilletera);
    if (b.comisionPct != null) patch.comisionPct = Number(b.comisionPct);
    const usuario = await AdminRepository.actualizarUsuario(id, patch);
    if (!usuario) throw new ValidationError('No hay cambios válidos o el usuario no existe');
    res.json({ usuario });
  },
};

export default AdminController;
