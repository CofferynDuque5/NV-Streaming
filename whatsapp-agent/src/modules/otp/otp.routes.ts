/**
 * Rutas de OTP (portadas de las Cloud Functions):
 *   POST /otp/telegram   webhook de Telegram (valida TELEGRAM_WEBHOOK_SECRET)
 *   POST /otp/whatsapp   webhook de WhatsApp/Evolution (valida WHATSAPP_OTP_TOKEN)
 *   GET  /api/codigos     últimos códigos (operador/admin)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { OtpController } from './otp.controller.js';
import { requireAuth, requireRol } from '../auth/auth.middleware.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export const otpRouter = Router();

// Webhooks (sin JWT; se validan con el token del webhook).
otpRouter.post('/otp/telegram', wrap(OtpController.telegram));
otpRouter.post('/otp/whatsapp', wrap(OtpController.whatsapp));

// Lectura para el back office.
otpRouter.get('/api/codigos', requireAuth, requireRol('admin', 'operador'), wrap(OtpController.listar));
