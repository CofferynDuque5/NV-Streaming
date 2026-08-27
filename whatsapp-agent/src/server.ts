/** Construcción de la app Express (rutas, middleware, manejo de errores). */
import express, { type Request, type Response, type NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger.js';
import { webhookRouter } from './modules/webhook/webhook.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { gatewayRouter } from './modules/gateway/gateway.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { cmsRouter } from './modules/cms/cms.routes.js';
import { commerceRouter } from './modules/commerce/commerce.routes.js';
import { userdocsRouter } from './modules/userdocs/userdocs.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { resellerRouter } from './modules/reseller/reseller.routes.js';
import { otpRouter } from './modules/otp/otp.routes.js';
import type { RawBodyRequest } from './modules/webhook/webhook.controller.js';

export function createApp() {
  const app = express();

  // Log de peticiones.
  app.use(pinoHttp({ logger }));

  // CORS. Por defecto permite el origen configurado o '*' (dev). En producción
  // define CORS_ORIGIN con tu dominio del frontend para restringirlo.
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', corsOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Body JSON conservando el cuerpo CRUDO (necesario para validar la firma HMAC).
  app.use(
    express.json({
      verify: (req: RawBodyRequest, _res, buf) => {
        req.rawBody = buf;
      },
      limit: '1mb',
    }),
  );

  // Healthcheck.
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'nv-stream-whatsapp-agent' }));

  // Webhook de WhatsApp.
  app.use('/webhook', webhookRouter);

  // Pasarela de pago (registro público + administración protegida).
  app.use('/pagos', paymentsRouter);

  // Usuarios (correo de bienvenida — protegido).
  app.use('/usuarios', usersRouter);

  // Auth web (registro / login / sesión con JWT).
  app.use('/api', authRouter);

  // CMS / contenido de tienda sobre Postgres (Fase 2a).
  app.use('/api', cmsRouter);

  // Transaccional: pedidos + billetera sobre Postgres (Fase 2b).
  app.use('/api', commerceRouter);

  // Documentos por usuario: suscripciones, soporte, notificaciones (Fase 2c).
  app.use('/api', userdocsRouter);
  app.use('/api', inventoryRouter);
  app.use('/api', resellerRouter);

  // OTP: webhooks de Telegram/WhatsApp + lectura (portado de Cloud Functions).
  app.use('/', otpRouter);

  // API pública de catálogo (servicios + precios reales, con CORS).
  app.use('/api', catalogRouter);

  // Gateway de configuración + perfil (tasa_bcv viva, estado Guest).
  app.use('/api', gatewayRouter);

  // Asistente NV: enrutador de intenciones sobre datos reales.
  app.use('/api', chatRouter);

  // 404.
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  // Manejador de errores centralizado.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Error no controlado');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
