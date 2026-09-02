/**
 * chat.routes.ts — API del Asistente NV para la web.
 * `POST /api/chat` { message } → el MessageHandler enruta la intención y responde
 * con datos reales. La IDENTIDAD se toma SIEMPRE del JWT (optionalAuth), nunca de
 * un `userId` del cuerpo: así un invitado obtiene respuestas generales (catálogo,
 * precios) pero jamás puede consultar datos ni renovar la cuenta de otra persona.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { messageHandler } from './message-handler.js';
import { asyncHandler } from '../../core/async-handler.js';
import { rateLimit } from '../../core/rate-limit.js';
import { optionalAuth, type AuthedRequest } from '../auth/auth.middleware.js';

export const chatRouter = Router();

chatRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// El asistente puede invocar al LLM: limitamos a 20 mensajes/min por IP para
// proteger cuota y coste ante bucles o abuso.
const limiteChat = rateLimit({ windowMs: 60_000, max: 20 });

chatRouter.post('/chat', limiteChat, optionalAuth, asyncHandler(async (req, res) => {
  const message = String((req.body && req.body.message) || '');
  // Identidad SOLO desde el token verificado. Sin sesión → invitado (null).
  const userId = (req as AuthedRequest).user?.sub ?? null;
  if (!message.trim()) { res.status(400).json({ ok: false, error: 'mensaje_vacio' }); return; }
  const respuesta = await messageHandler.procesar({ message, userId });
  res.json({ ok: true, ...respuesta });
}));
