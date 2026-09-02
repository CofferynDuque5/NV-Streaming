/**
 * chat.routes.ts — API del Asistente NV para la web.
 * `POST /api/chat` { message, userId } → el MessageHandler enruta la intención y
 * responde con datos reales. CORS abierto para consumo desde la web estática.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { messageHandler } from './message-handler.js';
import { asyncHandler } from '../../core/async-handler.js';
import { rateLimit } from '../../core/rate-limit.js';

export const chatRouter = Router();

chatRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// El asistente puede invocar al LLM: limitamos a 20 mensajes/min por IP para
// proteger cuota y coste ante bucles o abuso.
const limiteChat = rateLimit({ windowMs: 60_000, max: 20 });

chatRouter.post('/chat', limiteChat, asyncHandler(async (req, res) => {
  const message = String((req.body && req.body.message) || '');
  const userId = (req.body && req.body.userId) != null ? String(req.body.userId) : null;
  if (!message.trim()) { res.status(400).json({ ok: false, error: 'mensaje_vacio' }); return; }
  const respuesta = await messageHandler.procesar({ message, userId });
  res.json({ ok: true, ...respuesta });
}));
