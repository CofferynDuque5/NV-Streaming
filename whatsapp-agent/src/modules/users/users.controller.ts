/** Controlador de usuarios: disparo del correo de bienvenida. */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { emailService } from '../../services/email.service.js';

const BienvenidaSchema = z.object({
  email: z.string().email(),
  nombre: z.string().max(120).nullish(),
});

export const UsersController = {
  // POST /usuarios/bienvenida — envía bienvenida + T&C (lo llama la Cloud Function
  // al registrarse un usuario en Firebase, o el backend que gestione el registro).
  async bienvenida(req: Request, res: Response): Promise<void> {
    const parsed = BienvenidaSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'datos_invalidos', detalle: parsed.error.flatten().fieldErrors }); return; }
    const r = await emailService.enviarBienvenida(parsed.data.email, parsed.data.nombre ?? null);
    res.status(r ? 200 : 202).json({ ok: !!r, id: r?.id ?? null });
  },
};
