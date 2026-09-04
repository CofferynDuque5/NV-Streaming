/**
 * admin.controller.ts — Panel de administración (solo admin).
 * Expone un resumen REAL del negocio para el Back Office.
 */
import type { Request, Response } from 'express';
import { AdminRepository } from '../../db/repositories/admin.repo.js';

export const AdminController = {
  async overview(_req: Request, res: Response): Promise<void> {
    const resumen = await AdminRepository.overview();
    res.json({ resumen });
  },
};

export default AdminController;
