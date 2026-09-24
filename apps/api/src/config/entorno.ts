import { z } from 'zod';

const booleano = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

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
    /** Cada cuántos minutos se aplican vencimientos, gracia y suspensiones (0 = nunca). */
    VENCIMIENTOS_CADA_MINUTOS: z.coerce.number().int().min(0).max(1440).default(10),
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
