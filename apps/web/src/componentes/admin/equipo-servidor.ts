import type { Pagina, Rol, UsuarioPublico } from '@nv/shared';
import { leerApi } from '@/lib/api-servidor';

/** Persona del equipo que puede llevar un cliente o atender un ticket. */
export interface PersonaEquipo {
  id: string;
  nombre: string;
  rol: Rol;
}

/**
 * Personas activas del equipo con alguno de esos roles, ordenadas por nombre.
 * Requiere `usuarios.ver`; sin ese permiso la API responde 403 y la lista queda vacía.
 */
export async function cargarEquipo(roles: readonly Rol[]): Promise<PersonaEquipo[]> {
  const respuestas = await Promise.all(
    roles.map((rol) =>
      leerApi<Pagina<UsuarioPublico>>(`/usuarios?rol=${rol}&estado=activo&porPagina=100`),
    ),
  );
  return respuestas
    .flatMap((r) => r.datos?.elementos ?? [])
    .map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
