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
    CORREO_PROVEEDOR: z.enum(['sandbox', 'smtp']).default('sandbox'),
    CORREO_REMITENTE: z.string().min(3).default('NV Streaming <no-responder@example.com>'),
    SMTP_HOST: z.string().default(''),
    SMTP_PUERTO: z.coerce.number().int().positive().default(587),
    SMTP_SEGURO: booleano.default(false),
    SMTP_USUARIO: z.string().default(''),
    SMTP_CONTRASENA: z.string().default(''),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
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
    if (e.CORREO_REMITENTE.includes('example.com')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORREO_REMITENTE'],
        message: 'Configura un remitente real.',
      });
    }
  });

export type Entorno = z.infer<typeof EntornoSchema>;

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
