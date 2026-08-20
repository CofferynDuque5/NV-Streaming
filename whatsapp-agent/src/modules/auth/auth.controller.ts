/** Controlador de auth: traduce HTTP ↔ servicio y mapea errores a códigos. */
import type { Request, Response } from 'express';
import * as Auth from './auth.service.js';
import type { AuthedRequest } from './auth.middleware.js';

function manejarError(e: unknown, res: Response): void {
  if (e instanceof Auth.AuthError) {
    const status = e.code === 'email_en_uso' ? 409 : e.code === 'credenciales' ? 401 : 400;
    res.status(status).json({ error: e.code, mensaje: e.message });
    return;
  }
  res.status(500).json({ error: 'error_interno' });
}

export const AuthController = {
  async register(req: Request, res: Response): Promise<void> {
    try { res.status(201).json(await Auth.register(req.body || {})); }
    catch (e) { manejarError(e, res); }
  },

  async login(req: Request, res: Response): Promise<void> {
    try { res.json(await Auth.login(req.body || {})); }
    catch (e) { manejarError(e, res); }
  },

  async me(req: Request, res: Response): Promise<void> {
    const payload = (req as AuthedRequest).user;
    if (!payload) { res.status(401).json({ error: 'no_autenticado' }); return; }
    const sesion = await Auth.sesionDeId(payload.sub);
    if (!sesion) { res.status(404).json({ error: 'usuario_no_encontrado' }); return; }
    res.json({ usuario: sesion });
  },
};
