/** Construcción de la app Express (rutas, middleware, manejo de errores). */
import express from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger.js';
import { isProd } from './config/env.js';
import { requestId, requestTimeout } from './core/request-context.js';
import { rateLimit } from './core/rate-limit.js';
import { errorHandler, notFound } from './core/error-handler.js';
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
import { adminRouter } from './modules/admin/admin.routes.js';
import { otpRouter } from './modules/otp/otp.routes.js';
import type { RawBodyRequest } from './modules/webhook/webhook.controller.js';

export function createApp() {
  const app = express();

  // Identificador de correlación por petición (X-Request-Id) — antes del log
  // para que cada línea lo lleve.
  app.use(requestId());

  // Log de peticiones (incluye el requestId ya presente en la cabecera).
  app.use(pinoHttp({ logger }));

  // Presupuesto de tiempo por petición: si una ruta no responde en 20 s se
  // corta con 503 en vez de dejar la conexión colgada (resiliencia).
  app.use(requestTimeout(20_000));

  // Cabeceras de seguridad (sin dependencias): mitigan sniffing, clickjacking y
  // fuga de referer; HSTS solo en producción (requiere HTTPS).
  app.use((_req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('Referrer-Policy', 'no-referrer');
    res.header('X-DNS-Prefetch-Control', 'off');
    if (isProd) res.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });

  // CORS. `CORS_ORIGIN` acepta '*' (permitir todos, p. ej. docker-compose/dev) o
  // una lista blanca de dominios coma-separada. Si va vacío, se permite todo solo
  // fuera de producción. Con lista blanca, solo se refleja un Origin permitido.
  const PERMITIDOS = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const PERMITIR_TODO = PERMITIDOS.includes('*') || (PERMITIDOS.length === 0 && !isProd);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (PERMITIR_TODO) res.header('Access-Control-Allow-Origin', origin || '*');
    else if (origin && PERMITIDOS.includes(origin)) res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
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
  app.use('/api', adminRouter);

  // OTP: webhooks de Telegram/WhatsApp + lectura (portado de Cloud Functions).
  app.use('/', otpRouter);

  // API pública de catálogo (servicios + precios reales, con CORS).
  app.use('/api', catalogRouter);

  // Gateway de configuración + perfil (tasa_bcv viva, estado Guest).
  app.use('/api', gatewayRouter);

  // Asistente NV: enrutador de intenciones sobre datos reales.
  app.use('/api', chatRouter);

  // 404 uniforme.
  app.use(notFound);

  // Manejador de errores centralizado: normaliza AppError/ZodError → estado y
  // cuerpo JSON coherentes; registra con el requestId de correlación.
  app.use(errorHandler);

  return app;
}
