/**
 * chat.routes.ts — API del Asistente NV para la web.
 * `POST /api/chat` { message, userId } → el MessageHandler enruta la intención y
 * responde con datos reales. CORS abierto para consumo desde la web estática.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { messageHandler } from './message-handler.js';

export const chatRouter = Router();

chatRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

chatRouter.post('/chat', wrap(async (req, res) => {
  const message = String((req.body && req.body.message) || '');
  const userId = (req.body && req.body.userId) != null ? String(req.body.userId) : null;
  if (!message.trim()) { res.status(400).json({ ok: false, error: 'mensaje_vacio' }); return; }
  const respuesta = await messageHandler.procesar({ message, userId });
  res.json({ ok: true, ...respuesta });
}));
