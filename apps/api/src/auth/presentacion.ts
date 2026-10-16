import type { Sesion, Usuario } from '@nv/db';
import {
  permisosDe,
  type PasoPendiente,
  type SesionActual,
  type SesionListada,
  type UsuarioPublico,
} from '@nv/shared';

/** Datos del usuario que se pueden enviar al navegador (nunca hashes ni secretos). */
export function usuarioPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    estado: u.estado,
    correoVerificado: u.correoVerificadoEn !== null,
    dosPasosActivo: u.totpSecreto !== null,
    creadoEn: u.creadoEn.toISOString(),
    ultimoAccesoEn: u.ultimoAccesoEn?.toISOString() ?? null,
  };
}

export function sesionActual(u: Usuario, pendiente: PasoPendiente | null): SesionActual {
  return {
    usuario: usuarioPublico(u),
    // Con un paso pendiente la sesión no tiene permisos todavía.
    permisos: pendiente ? [] : [...permisosDe(u.rol)],
    pendiente,
  };
}

export function sesionListada(s: Sesion, actualId: string): SesionListada {
  return {
    id: s.id,
    actual: s.id === actualId,
    dispositivo: describirNavegador(s.agenteUsuario),
    ip: s.ip,
    creadaEn: s.creadaEn.toISOString(),
    ultimaActividadEn: s.ultimaActividadEn.toISOString(),
  };
}

/** Descripción breve y legible del navegador a partir del user-agent. */
export function describirNavegador(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  const sistema = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return sistema ? `${navegador} en ${sistema}` : navegador;
}
