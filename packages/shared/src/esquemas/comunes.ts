import { z } from 'zod';

export const correoSchema = z
  .string({ error: 'Escribe tu correo.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email({ error: 'Escribe un correo válido.' }));

export const nombreSchema = z
  .string({ error: 'Escribe tu nombre.' })
  .trim()
  .min(1, 'Escribe tu nombre.')
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(120, 'El nombre es demasiado largo.');

/** Contraseñas muy comunes que se rechazan aunque cumplan la longitud. */
const CONTRASENAS_COMUNES = new Set([
  '1234567890',
  '12345678910',
  'contraseña1',
  'contrasena1',
  'contraseña123',
  'contrasena123',
  'password123',
  'password1234',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  '123456789a',
  'abc1234567',
  'abcd123456',
  'nvstreaming',
  'nvstreaming123',
  'administrador',
  'iloveyou123',
]);

export const LONGITUD_MINIMA_CONTRASENA = 10;

export const contrasenaSchema = z
  .string({ error: 'Escribe una contraseña.' })
  .min(LONGITUD_MINIMA_CONTRASENA, `Usa al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`)
  .max(128, 'La contraseña no puede superar 128 caracteres.')
  .refine((v) => !CONTRASENAS_COMUNES.has(v.toLowerCase()), {
    error: 'Esa contraseña es demasiado común. Elige otra.',
  })
  .refine((v) => new Set(v).size >= 5, {
    error: 'La contraseña repite demasiados caracteres.',
  });

export const tokenSchema = z
  .string({ error: 'Falta el enlace de verificación.' })
  .trim()
  .min(20, 'El enlace no es válido.')
  .max(200, 'El enlace no es válido.');

export const codigo2faSchema = z
  .string({ error: 'Escribe el código.' })
  .trim()
  .regex(/^\d{6}$/, 'El código tiene 6 dígitos.');

export const codigoRespaldoSchema = z
  .string({ error: 'Escribe el código de respaldo.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/, 'El código de respaldo tiene el formato XXXXX-XXXXX.');

export const uuidSchema = z.uuid({ error: 'Identificador no válido.' });

export const paginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Versión parcial de un esquema de objeto para actualizaciones: quita los
 * valores por defecto, que de otro modo sobrescribirían lo que no se envía.
 */
export function parcialSinDefectos<T extends z.ZodRawShape>(esquema: z.ZodObject<T>) {
  const forma = Object.fromEntries(
    Object.entries(esquema.shape).map(([k, v]) => [
      k,
      v instanceof z.ZodDefault ? (v.unwrap() as z.ZodType) : (v as z.ZodType),
    ]),
  ) as unknown as { [K in keyof T]: T[K] extends z.ZodDefault<infer I> ? I : T[K] };
  return z.object(forma).partial();
}
