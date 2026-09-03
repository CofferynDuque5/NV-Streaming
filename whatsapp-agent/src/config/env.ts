/**
 * Carga y valida las variables de entorno una sola vez, al arranque.
 * Si falta o es inválida alguna variable requerida, el proceso falla rápido
 * con un mensaje claro (fail-fast) en lugar de romperse en runtime.
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // WhatsApp Cloud API
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN es requerido'),
  WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET es requerido'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''), // requerido a partir del Paso 3 (envío)
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  // Plantilla aprobada en Meta para el aviso de vencimiento.
  WHATSAPP_TEMPLATE_VENCIMIENTO: z.string().default('vencimiento_perfil'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('es'),

  // Tareas programadas (cron).
  REMINDER_DIAS_ANTES: z.coerce.number().int().positive().default(3),
  CRON_EXPIRY_REMINDER: z.string().default('0 9 * * *'), // a diario 09:00
  CRON_RENEWALS: z.string().default('0 */6 * * *'),      // cada 6 h
  CRON_TZ: z.string().default('America/Caracas'),
  CRON_ENABLED: z.enum(['on', 'off']).default('on'),

  // Base de datos
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL de conexión válida'),

  // IA — OpenAI (Paso 2). La clave es opcional al arrancar para no bloquear el
  // webhook; el agente valida su presencia cuando se invoca.
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Clave para cifrar/descifrar credenciales en reposo (AES-256-GCM).
  // 32 bytes en base64 o hex. Si falta, se usa una clave de desarrollo (con aviso).
  CREDENTIALS_ENC_KEY: z.string().default(''),

  // Token para proteger los endpoints administrativos de pagos (confirmar/rechazar).
  ADMIN_API_TOKEN: z.string().default(''),

  // Datos de recepción de pagos (mostrados como instrucciones; NV Panel).
  // Sin valores por defecto reales: son datos de cobro/PII y deben configurarse
  // explícitamente por entorno. Vacío ⇒ el método se muestra "por configurar".
  PAGO_MOVIL_BANCO: z.string().default(''),
  PAGO_MOVIL_CEDULA: z.string().default(''),
  PAGO_MOVIL_TELEFONO: z.string().default(''),
  PAGO_MOVIL_TITULAR: z.string().default(''),
  BINANCE_EMAIL: z.string().default(''),
  ZELLE_EMAIL: z.string().default(''),
  ZELLE_TITULAR: z.string().default(''),

  // ── Pasarela de pago automática (PSP · webhooks) ──
  // Binance Pay: clave/secreto de la API del comercio (para verificar la firma).
  BINANCE_PAY_KEY: z.string().default(''),
  BINANCE_PAY_SECRET: z.string().default(''),
  // Pago Móvil: secreto compartido con el puente/agregador (HMAC-SHA256).
  PAGO_MOVIL_WEBHOOK_SECRET: z.string().default(''),
  // Validación estricta de monto cuando la moneda del PSP != moneda del plan.
  PSP_STRICT_AMOUNT: z.enum(['on', 'off']).default('on'),

  // ── Correo (SMTP · bienvenida + factura) ──
  SMTP_HOST: z.string().default(''),                 // sin host → correo deshabilitado (log)
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('NV Stream <no-reply@nvstreaming.com>'),
  TERMS_URL: z.string().default('https://nvstreaming.com/terminos'),
  EMPRESA_NOMBRE: z.string().default('NV Stream'),

  // WhatsApp del administrador (para alertas de stock agotado, etc.).
  ADMIN_WHATSAPP: z.string().default(''),

  // Auth web (JWT). En PRODUCCIÓN debe definirse un secreto fuerte (el módulo
  // de auth aborta si falta en prod). Genera uno con:
  //   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Acceso con Google (opcional). Client ID OAuth de Google (Web) — el MISMO
  // que uses en el frontend (config.js googleClientId). Vacío ⇒ Google desactivado.
  GOOGLE_CLIENT_ID: z.string().default(''),

  // OTP (portado de las Cloud Functions). Secretos de los webhooks entrantes y
  // token del bot de Telegram para reenviar el código al cliente. Si un secreto
  // queda vacío, ese webhook NO valida token (solo para desarrollo).
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  WHATSAPP_OTP_TOKEN: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Sin logger todavía: escribimos directo a stderr y abortamos.
  console.error('❌ Variables de entorno inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
export const isProd = env.NODE_ENV === 'production';
