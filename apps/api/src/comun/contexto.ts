import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import {
  COOKIE_MONEDA,
  detectarUbicacion,
  type Permiso,
  type PasoPendiente,
  type Ubicacion,
} from '@nv/shared';
import type { FastifyRequest } from 'fastify';
import type { Sesion, Usuario } from '@nv/db';

export interface ContextoAuth {
  usuario: Usuario;
  sesion: Sesion;
  pendiente: PasoPendiente | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: ContextoAuth;
  }
}

export const META_PUBLICA = 'nv:publica';
export const META_PERMITE_PENDIENTE = 'nv:permite-pendiente';
export const META_PERMISO = 'nv:permiso';

/** La ruta no requiere sesión. */
export const Publica = () => SetMetadata(META_PUBLICA, true);

/** La ruta acepta sesiones a las que aún les falta la verificación en dos pasos. */
export const PermitePendiente = () => SetMetadata(META_PERMITE_PENDIENTE, true);

/** La ruta exige este permiso (se comprueba con el rol leído de la base de datos). */
export const RequierePermiso = (permiso: Permiso) => SetMetadata(META_PERMISO, permiso);

/** Inyecta el contexto de autenticación de la petición. */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): ContextoAuth => {
  const peticion = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!peticion.auth) throw new Error('Auth() usado en una ruta pública.');
  return peticion.auth;
});

export interface InfoCliente {
  ip: string | null;
  agenteUsuario: string | null;
  idPeticion: string;
}

/** IP (ya resuelta según los proxies de confianza), navegador e id de la petición. */
export const Cliente = createParamDecorator((_: unknown, ctx: ExecutionContext): InfoCliente => {
  const p = ctx.switchToHttp().getRequest<FastifyRequest>();
  const ua = p.headers['user-agent'];
  return {
    ip: p.ip ?? null,
    agenteUsuario: typeof ua === 'string' ? ua.slice(0, 400) : null,
    idPeticion: String(p.id),
  };
});

/**
 * País de la conexión (según la cabecera de la CDN) y moneda sugerida. Solo
 * sirve para proponer valores por defecto: nunca para decisiones de seguridad.
 */
export const UbicacionVisitante = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Ubicacion => {
    const p = ctx.switchToHttp().getRequest<FastifyRequest>();
    return detectarUbicacion(p.headers, p.cookies?.[COOKIE_MONEDA]);
  },
);
