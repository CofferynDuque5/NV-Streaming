import { z } from 'zod';

const booleano = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** URL https (las fuentes de la tasa nunca se consultan sin cifrar). Vacía = sin configurar. */
const urlHttps = (nombre: string, defecto = '') =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^https:\/\/\S+$/i.test(v) && URL.canParse(v)), {
      error: `${nombre} debe ser una URL https válida.`,
    })
    .default(defecto);

/** Nombre de un modelo de IA (sin espacios ni comillas). Vacío = sin configurar. */
const nombreModelo = (nombre: string) =>
  z
    .string()
    .trim()
    .max(80, `${nombre} es demasiado largo.`)
    .regex(/^[\w.:/-]*$/, `${nombre} tiene caracteres no válidos.`);

/** Precio en USD por millón de tokens, como texto decimal ("3" o "0.25"). Vacío = sin configurar. */
const precioMtok = (nombre: string) =>
  z
    .string()
    .trim()
    .regex(/^(\d{1,6}(\.\d{1,6})?)?$/, `${nombre} debe ser un importe en USD, p. ej. 3 o 0.25.`)
    .default('');

/**
 * `trustProxy` de Fastify a partir del número de proxies de confianza. Fastify 5.12 ya no
 * acepta un número (lo trata como «no confiar en nadie» y la API vería siempre la IP del
 * proxy, compartiendo los límites de uso entre todos los visitantes); una función con el
 * mismo significado sí se respeta: se confía en los `saltos` proxies más cercanos.
 * La API solo es alcanzable desde esos proxies (red interna de Docker o localhost).
 */
function confiarEnProxies(saltos: number): false | ((direccion: string, salto: number) => boolean) {
  return saltos === 0 ? false : (_direccion, salto) => salto < saltos;
}

const EntornoSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PUERTO: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url({ error: 'DATABASE_URL debe ser una URL de conexión de PostgreSQL.' }),
    WEB_ORIGEN: z
      .url({ error: 'WEB_ORIGEN debe ser la URL pública de la web.' })
      .transform((v) => new URL(v).origin),
    PROXIES_DE_CONFIANZA: z.coerce.number().int().min(0).max(5).default(1),
    DOCS_API_HABILITADA: booleano.default(true),
    CLAVE_CIFRADO: z
      .string({ error: 'Falta CLAVE_CIFRADO (32 bytes en base64). Mira .env.example.' })
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        error: 'CLAVE_CIFRADO debe ser exactamente 32 bytes codificados en base64.',
      }),
    SESION_DURACION_HORAS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(12),
    SESION_INACTIVIDAD_MINUTOS: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(120),
    /** Carpeta donde se guardan los comprobantes. Fuera de la carpeta pública de la web. */
    ALMACEN_DIR: z.string().min(1).default('almacen'),
    COMPROBANTE_MAX_MB: z.coerce.number().int().min(1).max(20).default(5),
    /**
     * Cada cuántos minutos el trabajador aplica vencimientos, gracia y suspensiones
     * (0 = nunca). Lo hace el proceso trabajador (`dist/trabajador.js`).
     */
    VENCIMIENTOS_CADA_MINUTOS: z.coerce.number().int().min(0).max(1440).default(10),
    /**
     * Respaldo para instalaciones sin trabajador: la API también pasa los
     * vencimientos con su propio temporizador. Los avisos quedan en cola hasta
     * que arranque un trabajador.
     */
    VENCIMIENTOS_EN_API: booleano.default(false),
    /** Cada cuántos segundos el trabajador busca trabajos pendientes cuando la cola está vacía. */
    TRABAJADOR_ESPERA_SEGUNDOS: z.coerce.number().int().min(1).max(300).default(5),
    /** WhatsApp: "desactivado", "sandbox" (solo registra) o "cloud_api" (WhatsApp Cloud API de Meta). */
    WHATSAPP_PROVEEDOR: z.enum(['desactivado', 'sandbox', 'cloud_api']).default('desactivado'),
    WHATSAPP_TOKEN: z.string().trim().default(''),
    WHATSAPP_TELEFONO_ID: z
      .string()
      .trim()
      .regex(/^\d*$/, 'WHATSAPP_TELEFONO_ID es el id numérico del número en Meta.')
      .default(''),
    /** Código de idioma de las plantillas aprobadas en Meta (p. ej. "es" o "es_MX"). */
    WHATSAPP_IDIOMA: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'WHATSAPP_IDIOMA debe ser un código como "es" o "es_MX".')
      .default('es'),
    /** Versión de la Graph API de Meta. */
    WHATSAPP_API_VERSION: z
      .string()
      .trim()
      .regex(/^v\d{1,3}\.\d$/, 'WHATSAPP_API_VERSION debe tener la forma v23.0.')
      .default('v23.0'),
    /** Página oficial del BCV de la que se lee la tasa del dólar. */
    TASA_BCV_URL: urlHttps('TASA_BCV_URL', 'https://www.bcv.org.ve/'),
    /** Fuente JSON alternativa (https) y ruta del campo con el valor, p. ej. "monitors.bcv.price". */
    TASA_JSON_URL: urlHttps('TASA_JSON_URL'),
    TASA_JSON_CAMPO: z
      .string()
      .trim()
      .regex(
        /^([A-Za-z0-9_-]+)(\.[A-Za-z0-9_-]+)*$|^$/,
        'TASA_JSON_CAMPO es una ruta como "datos.usd.valor".',
      )
      .default(''),
    /**
     * URL pública de la API (sin /api/v1) para las URL de webhook que se registran en las
     * pasarelas. Vacía = WEB_ORIGEN (la web reenvía /api a la API).
     */
    API_URL_PUBLICA: z
      .string()
      .trim()
      .refine((v) => v === '' || URL.canParse(v), {
        error: 'API_URL_PUBLICA debe ser una URL válida.',
      })
      .transform((v) => (v ? new URL(v).origin : ''))
      .default(''),
    /**
     * Pasarela de pruebas (sandbox): cobra de mentira y simula aprobaciones, rechazos y
     * tokens. Por defecto activa fuera de producción; en producción no se permite.
     */
    PASARELA_SANDBOX_HABILITADA: z.preprocess(
      (v) => (v === '' ? undefined : v),
      booleano.optional(),
    ),
    /** PayPal: credenciales de la app REST y id del webhook registrado. */
    PAYPAL_CLIENTE_ID: z.string().trim().default(''),
    PAYPAL_SECRETO: z.string().trim().default(''),
    PAYPAL_WEBHOOK_ID: z.string().trim().default(''),
    PAYPAL_MODO: z.enum(['pruebas', 'produccion']).default('pruebas'),
    /** Mercado Pago (Checkout Pro): token de acceso y clave secreta de la firma de los webhooks. */
    MERCADOPAGO_TOKEN_ACCESO: z.string().trim().default(''),
    MERCADOPAGO_SECRETO_WEBHOOK: z.string().trim().default(''),
    MERCADOPAGO_MODO: z.enum(['pruebas', 'produccion']).default('pruebas'),
    /**
     * Moneda de la cuenta de Mercado Pago (una cuenta opera en un solo país y moneda).
     * Sin ella el adaptador no se ofrece: nunca se crea una preferencia en otra moneda.
     */
    MERCADOPAGO_MONEDA: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toUpperCase() || undefined : v),
      z
        .enum(['ARS', 'COP', 'PEN'], { error: 'MERCADOPAGO_MONEDA debe ser ARS, COP o PEN.' })
        .optional(),
    ),
    /** Solo pruebas automáticas: otra URL base para la API de Mercado Pago (servidor falso). */
    MERCADOPAGO_API_URL: z
      .string()
      .trim()
      .refine((v) => v === '' || URL.canParse(v), {
        error: 'MERCADOPAGO_API_URL debe ser una URL válida.',
      })
      .default(''),
    // ── Asistente de IA (fase 5) ──────────────────────────────────────────────
    /** Ollama (modelo local, gratis). Vacía = motor local no disponible. */
    OLLAMA_URL: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^https?:\/\/\S+$/i.test(v) && URL.canParse(v)), {
        error: 'OLLAMA_URL debe ser una URL http(s) válida, p. ej. http://127.0.0.1:11434.',
      })
      .default('http://127.0.0.1:11434'),
    /** Modelo de Ollama por defecto (el panel puede elegir otro ya descargado). */
    OLLAMA_MODELO: nombreModelo('OLLAMA_MODELO').default('qwen2.5:7b-instruct'),
    /** Segundos máximos por respuesta del modelo local (en CPU puede tardar). */
    OLLAMA_TIEMPO_LIMITE_S: z.coerce.number().int().min(10).max(600).default(120),
    /** Anthropic (Claude, de pago). Sin clave, modelo y precios, no se ofrece. */
    ANTHROPIC_API_KEY: z.string().trim().default(''),
    /** Id exacto del modelo, copiado de la consola de Anthropic. */
    ANTHROPIC_MODELO: nombreModelo('ANTHROPIC_MODELO').default(''),
    /** Precio en USD por millón de tokens de entrada y de salida de ese modelo (para el tope mensual). */
    ANTHROPIC_PRECIO_ENTRADA_MTOK: precioMtok('ANTHROPIC_PRECIO_ENTRADA_MTOK'),
    ANTHROPIC_PRECIO_SALIDA_MTOK: precioMtok('ANTHROPIC_PRECIO_SALIDA_MTOK'),
    /** Solo pruebas automáticas: otra URL base para la API de Anthropic (servidor falso). */
    ANTHROPIC_API_URL: z
      .string()
      .trim()
      .refine((v) => v === '' || URL.canParse(v), {
        error: 'ANTHROPIC_API_URL debe ser una URL válida.',
      })
      .default(''),
    /**
     * Asistente de pruebas (respuestas fijas, sin modelo). Por defecto activo fuera de
     * producción; en producción no se permite.
     */
    ASISTENTE_SANDBOX_HABILITADO: z.preprocess(
      (v) => (v === '' ? undefined : v),
      booleano.optional(),
    ),
    // ── Entregas de servicios (fase 6) ─────────────────────────────────────────
    /**
     * Solo pruebas: permite webhooks de entrega por http y a direcciones privadas o
     * locales (servidores falsos). En producción no se permite.
     */
    ENTREGAS_WEBHOOK_RED_LOCAL: booleano.default(false),
    /**
     * Respaldo para instalaciones sin trabajador: la API también procesa la cola de
     * entregas (y sus reintentos) cada pocos segundos.
     */
    ENTREGAS_EN_API: booleano.default(false),
    CORREO_PROVEEDOR: z.enum(['sandbox', 'smtp']).default('sandbox'),
    CORREO_REMITENTE: z.string().min(3).default('NV Streaming <no-responder@example.com>'),
    SMTP_HOST: z.string().default(''),
    SMTP_PUERTO: z.coerce.number().int().positive().default(587),
    SMTP_SEGURO: booleano.default(false),
    SMTP_USUARIO: z.string().default(''),
    SMTP_CONTRASENA: z.string().default(''),
  })
  .transform((e) => ({
    ...e,
    PROXIES_DE_CONFIANZA: confiarEnProxies(e.PROXIES_DE_CONFIANZA),
    PASARELA_SANDBOX_HABILITADA: e.PASARELA_SANDBOX_HABILITADA ?? e.NODE_ENV !== 'production',
    ASISTENTE_SANDBOX_HABILITADO: e.ASISTENTE_SANDBOX_HABILITADO ?? e.NODE_ENV !== 'production',
  }))
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
    if (e.PASARELA_SANDBOX_HABILITADA) {
      ctx.addIssue({
        code: 'custom',
        path: ['PASARELA_SANDBOX_HABILITADA'],
        message: 'En producción la pasarela de pruebas debe estar desactivada.',
      });
    }
    // En producción no se permiten valores de desarrollo o de ejemplo.
    if (!e.WEB_ORIGEN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGEN'],
        message: 'En producción WEB_ORIGEN debe usar https.',
      });
    }
    if (/nv_local_dev|contrasena|password@/i.test(e.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL usa una contraseña de ejemplo.',
      });
    }
    if (e.CORREO_PROVEEDOR === 'sandbox') {
      ctx.addIssue({
        code: 'custom',
        path: ['CORREO_PROVEEDOR'],
        message: 'En producción el correo debe enviarse por SMTP.',
      });
    }
    if (e.WHATSAPP_PROVEEDOR === 'sandbox') {
      ctx.addIssue({
        code: 'custom',
        path: ['WHATSAPP_PROVEEDOR'],
        message: 'En producción WhatsApp debe estar desactivado o usar cloud_api.',
      });
    }
    if (e.WHATSAPP_PROVEEDOR === 'cloud_api' && (!e.WHATSAPP_TOKEN || !e.WHATSAPP_TELEFONO_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['WHATSAPP_TOKEN'],
        message: 'WhatsApp Cloud API necesita WHATSAPP_TOKEN y WHATSAPP_TELEFONO_ID.',
      });
    }
    if (e.ASISTENTE_SANDBOX_HABILITADO) {
      ctx.addIssue({
        code: 'custom',
        path: ['ASISTENTE_SANDBOX_HABILITADO'],
        message: 'En producción el asistente de pruebas debe estar desactivado.',
      });
    }
    if (e.ANTHROPIC_API_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_URL'],
        message: 'ANTHROPIC_API_URL es solo para pruebas: déjala vacía en producción.',
      });
    }
    if (e.ENTREGAS_WEBHOOK_RED_LOCAL) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENTREGAS_WEBHOOK_RED_LOCAL'],
        message:
          'ENTREGAS_WEBHOOK_RED_LOCAL es solo para pruebas: en producción los webhooks de entrega van por https a direcciones públicas.',
      });
    }
    if (e.MERCADOPAGO_API_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['MERCADOPAGO_API_URL'],
        message: 'MERCADOPAGO_API_URL es solo para pruebas: déjala vacía en producción.',
      });
    }
    if (e.CORREO_REMITENTE.includes('example.com')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORREO_REMITENTE'],
        message: 'Configura un remitente real.',
      });
    }
  });

export type Entorno = z.output<typeof EntornoSchema>;

/** Valida las variables de entorno al arrancar y falla con un mensaje claro. */
export function cargarEntorno(fuente: NodeJS.ProcessEnv = process.env): Entorno {
  const resultado = EntornoSchema.safeParse(fuente);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  - ${i.path.join('.') || '(general)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración inválida. Revisa tu .env:\n${detalle}`);
  }
  return resultado.data;
}
