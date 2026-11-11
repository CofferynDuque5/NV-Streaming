import { z } from 'zod';
import { uuidSchema } from './comunes.js';

/** Minutos hacia atrás en que se buscan correos con códigos. */
export const MINUTOS_CODIGO = [15, 30, 60, 180, 720, 1440] as const;
export const MINUTOS_CODIGO_CLIENTE = 30;

/** Servidores IMAP conocidos para llenar el formulario más rápido. */
export const PROVEEDORES_IMAP = [
  {
    clave: 'gmail',
    nombre: 'Gmail',
    host: 'imap.gmail.com',
    puerto: 993,
    ayuda:
      'Gmail no acepta tu contraseña normal: activa la verificación en 2 pasos y crea una «contraseña de aplicación» en Cuenta de Google > Seguridad. Pega esa clave de 16 letras.',
  },
  {
    clave: 'hostinger',
    nombre: 'Hostinger',
    host: 'imap.hostinger.com',
    puerto: 993,
    ayuda: 'Usa el correo completo y la clave del buzón creado en hPanel > Correos.',
  },
  {
    clave: 'cpanel',
    nombre: 'cPanel / dominio propio',
    host: 'mail.tudominio.com',
    puerto: 993,
    ayuda: 'Cambia «tudominio.com» por tu dominio. Usa el correo completo y la clave del buzón.',
  },
  {
    clave: 'zoho',
    nombre: 'Zoho Mail',
    host: 'imap.zoho.com',
    puerto: 993,
    ayuda: 'Activa IMAP en Zoho Mail > Ajustes > Correo > Acceso IMAP.',
  },
  {
    clave: 'yahoo',
    nombre: 'Yahoo',
    host: 'imap.mail.yahoo.com',
    puerto: 993,
    ayuda: 'Crea una contraseña de aplicación en la seguridad de tu cuenta de Yahoo.',
  },
] as const;

/**
 * Asuntos sugeridos por servicio (se reconocen por el nombre). Son un punto de
 * partida: los asuntos cambian según el idioma de la cuenta y se pueden editar.
 */
export const ASUNTOS_SUGERIDOS: { patron: RegExp; asuntos: string[] }[] = [
  {
    patron: /netflix/i,
    asuntos: [
      'código de acceso temporal',
      'código de inicio de sesión',
      'Hogar con Netflix',
      'Netflix: tu código',
      'temporary access code',
      'sign-in code',
      'Netflix Household',
    ],
  },
  {
    patron: /disney/i,
    asuntos: ['código de acceso único', 'one-time passcode', 'código de verificación'],
  },
  {
    patron: /\b(max|hbo)\b/i,
    asuntos: ['código de verificación', 'código de acceso', 'verification code', 'Restablece'],
  },
  {
    patron: /prime|amazon/i,
    asuntos: ['código de verificación', 'Amazon: intento de inicio', 'verification code'],
  },
  {
    patron: /paramount/i,
    asuntos: ['código de verificación', 'verification code'],
  },
  {
    patron: /crunchyroll/i,
    asuntos: ['código', 'Crunchyroll'],
  },
  {
    patron: /vix/i,
    asuntos: ['código', 'ViX'],
  },
];

export function asuntosSugeridos(nombreServicio: string): string[] {
  return ASUNTOS_SUGERIDOS.find((s) => s.patron.test(nombreServicio))?.asuntos ?? [];
}

const hostSchema = z
  .string({ error: 'Escribe el servidor IMAP.' })
  .trim()
  .toLowerCase()
  .min(3, 'Escribe el servidor IMAP.')
  .max(120, 'Es demasiado largo.')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    'Escribe solo el servidor, por ejemplo imap.gmail.com.',
  );

const camposBuzon = {
  nombre: z
    .string({ error: 'Ponle un nombre.' })
    .trim()
    .min(1, 'Ponle un nombre.')
    .max(60, 'Máximo 60 caracteres.'),
  host: hostSchema,
  puerto: z.coerce.number().int().min(1, 'Puerto no válido.').max(65535, 'Puerto no válido.'),
  seguro: z.boolean(),
  usuario: z
    .string({ error: 'Escribe el correo del buzón.' })
    .trim()
    .min(3, 'Escribe el correo del buzón.')
    .max(254, 'Es demasiado largo.')
    .refine((v) => !/\s/.test(v), 'No puede tener espacios.'),
  clave: z
    .string({ error: 'Escribe la clave del buzón.' })
    .min(1, 'Escribe la clave del buzón.')
    .max(300, 'La clave es demasiado larga.'),
  carpeta: z.string().trim().min(1).max(120),
  activo: z.boolean(),
};

export const buzonSchema = z.object({
  ...camposBuzon,
  puerto: camposBuzon.puerto.default(993),
  seguro: camposBuzon.seguro.default(true),
  carpeta: camposBuzon.carpeta.default('INBOX'),
  activo: camposBuzon.activo.default(true),
});
export type BuzonEntrada = z.infer<typeof buzonSchema>;

export const actualizarBuzonSchema = z
  .object({
    ...camposBuzon,
    /** Vacío: se conserva la clave guardada. */
    clave: z
      .string()
      .max(300, 'La clave es demasiado larga.')
      .transform((v) => v || undefined)
      .optional(),
  })
  .partial()
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'No hay cambios.');
export type ActualizarBuzonEntrada = z.infer<typeof actualizarBuzonSchema>;

export const asuntoCodigoSchema = z.object({
  servicioId: uuidSchema,
  asunto: z
    .string({ error: 'Escribe el asunto.' })
    .trim()
    .min(3, 'Escribe al menos 3 letras del asunto.')
    .max(160, 'Máximo 160 caracteres.'),
});
export type AsuntoCodigoEntrada = z.infer<typeof asuntoCodigoSchema>;

export const buscarCodigoSchema = z
  .object({
    /** Cuenta guardada: se busca por su correo (que nunca sale del servidor). */
    cuentaId: uuidSchema.optional(),
    /** O un correo escrito a mano. */
    correo: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .pipe(z.email({ error: 'Escribe un correo válido.' }))
      .optional(),
    /** Servicio cuyos asuntos filtran los correos. Con cuentaId se toma el de la cuenta. */
    servicioId: uuidSchema.optional(),
    minutos: z.coerce.number().int().min(5).max(1440).default(60),
  })
  .refine((o) => Boolean(o.cuentaId) !== Boolean(o.correo), {
    message: 'Elige una cuenta o escribe un correo.',
    path: ['correo'],
  });
export type BuscarCodigoEntrada = z.infer<typeof buscarCodigoSchema>;
