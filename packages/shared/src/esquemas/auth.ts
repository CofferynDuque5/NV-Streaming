import { z } from 'zod';
import {
  codigo2faSchema,
  codigoRespaldoSchema,
  contrasenaSchema,
  correoSchema,
  nombreSchema,
  tokenSchema,
} from './comunes.js';

export const registroSchema = z
  .object({
    nombre: nombreSchema,
    correo: correoSchema,
    contrasena: contrasenaSchema,
    aceptaTerminos: z.literal(true, {
      error: 'Debes aceptar los términos y la política de privacidad.',
    }),
  })
  .refine((d) => !d.contrasena.toLowerCase().includes(d.correo.split('@')[0] ?? '\u0000'), {
    error: 'La contraseña no puede contener tu correo.',
    path: ['contrasena'],
  });
export type RegistroEntrada = z.infer<typeof registroSchema>;

export const inicioSesionSchema = z.object({
  correo: correoSchema,
  contrasena: z
    .string({ error: 'Escribe tu contraseña.' })
    .min(1, 'Escribe tu contraseña.')
    .max(128),
});
export type InicioSesionEntrada = z.infer<typeof inicioSesionSchema>;

export const verificar2faSchema = z.union([
  z.object({ codigo: codigo2faSchema }),
  z.object({ codigoRespaldo: codigoRespaldoSchema }),
]);
export type Verificar2faEntrada = z.infer<typeof verificar2faSchema>;

export const confirmar2faSchema = z.object({ codigo: codigo2faSchema });

export const desactivar2faSchema = z.object({
  contrasena: z.string().min(1, 'Escribe tu contraseña.').max(128),
  codigo: codigo2faSchema,
});

export const verificarCorreoSchema = z.object({ token: tokenSchema });

export const solicitarCorreoSchema = z.object({ correo: correoSchema });

export const restablecerContrasenaSchema = z.object({
  token: tokenSchema,
  contrasena: contrasenaSchema,
});

export const aceptarInvitacionSchema = z.object({
  token: tokenSchema,
  nombre: nombreSchema,
  contrasena: contrasenaSchema,
});

export const cambiarContrasenaSchema = z.object({
  actual: z.string().min(1, 'Escribe tu contraseña actual.').max(128),
  nueva: contrasenaSchema,
});

export const actualizarPerfilSchema = z.object({ nombre: nombreSchema });

/** Qué le falta a una sesión para quedar completa. */
export const PASOS_PENDIENTES = ['configurar_2fa', 'verificar_2fa'] as const;
export type PasoPendiente = (typeof PASOS_PENDIENTES)[number];
