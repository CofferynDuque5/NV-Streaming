import { z } from 'zod';
import { ROLES } from '../roles.js';
import { correoSchema, nombreSchema, paginacionSchema } from './comunes.js';

export const rolSchema = z.enum(ROLES, { error: 'Rol no válido.' });

export const ESTADOS_USUARIO = ['activo', 'suspendido'] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];
export const estadoUsuarioSchema = z.enum(ESTADOS_USUARIO, { error: 'Estado no válido.' });

export const listarUsuariosSchema = paginacionSchema.extend({
  rol: rolSchema.optional(),
  estado: estadoUsuarioSchema.optional(),
  busqueda: z.string().trim().max(120).optional(),
});
export type ListarUsuariosEntrada = z.infer<typeof listarUsuariosSchema>;

export const invitarUsuarioSchema = z.object({
  correo: correoSchema,
  nombre: nombreSchema,
  rol: rolSchema,
});

export const cambiarRolSchema = z.object({ rol: rolSchema });
export const cambiarEstadoSchema = z.object({
  estado: estadoUsuarioSchema,
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(500),
});

export const listarAuditoriaSchema = paginacionSchema.extend({
  accion: z.string().trim().max(80).optional(),
  entidad: z.string().trim().max(80).optional(),
  actorId: z.uuid().optional(),
});
export type ListarAuditoriaEntrada = z.infer<typeof listarAuditoriaSchema>;
