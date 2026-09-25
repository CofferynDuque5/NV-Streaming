import { nombreCookieSesion } from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Entorno } from '../config/entorno.js';

const esSeguro = (entorno: Entorno) => entorno.WEB_ORIGEN.startsWith('https://');

export function leerCookieSesion(peticion: FastifyRequest, entorno: Entorno): string | undefined {
  return peticion.cookies[nombreCookieSesion(esSeguro(entorno))];
}

/** Cookie httpOnly: el JavaScript de la página nunca ve el token. */
export function ponerCookieSesion(
  respuesta: FastifyReply,
  entorno: Entorno,
  token: string,
  segundos: number,
): void {
  void respuesta.setCookie(nombreCookieSesion(esSeguro(entorno)), token, {
    httpOnly: true,
    secure: esSeguro(entorno),
    sameSite: 'lax',
    path: '/',
    maxAge: segundos,
  });
}

export function borrarCookieSesion(respuesta: FastifyReply, entorno: Entorno): void {
  void respuesta.clearCookie(nombreCookieSesion(esSeguro(entorno)), {
    httpOnly: true,
    secure: esSeguro(entorno),
    sameSite: 'lax',
    path: '/',
  });
}
