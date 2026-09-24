import {
  ESTADOS_USUARIO,
  ETIQUETAS_ROL,
  listarUsuariosSchema,
  type Pagina,
  ROLES,
  type UsuarioPublico,
} from '@nv/shared';
import { ChevronRight, Search, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvitarPersona } from '@/componentes/panel/equipo';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Equipo y usuarios' };

export default async function Equipo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'usuarios.ver' });
  const puedeGestionar = sesion.permisos.includes('usuarios.gestionar');
  const crudo = await searchParams;
  const filtro = listarUsuariosSchema.safeParse({
    ...Object.fromEntries(Object.entries(crudo).filter(([, v]) => v)),
    porPagina: 20,
  });
  const f = filtro.success ? filtro.data : listarUsuariosSchema.parse({ porPagina: 20 });
  const parametros = { rol: f.rol, estado: f.estado, busqueda: f.busqueda };
  const q = new URLSearchParams(
    Object.entries({
      ...parametros,
      pagina: String(f.pagina),
      porPagina: String(f.porPagina),
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const { datos } = await leerApi<Pagina<UsuarioPublico>>(`/usuarios?${q}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 20 };

  return (
    <>
      <CabeceraPagina
        titulo="Equipo y usuarios"
        descripcion="Todas las cuentas de NV: equipo interno, revendedores y clientes."
        acciones={puedeGestionar ? <InvitarPersona /> : undefined}
      />

      <Tarjeta>
        <form
          className="flex flex-wrap items-end gap-3 border-b border-borde px-5 py-4 sm:px-6"
          role="search"
        >
          <div className="relative min-w-52 flex-1">
            <label htmlFor="busqueda" className="sr-only">
              Buscar por nombre o correo
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden="true"
            />
            <input
              id="busqueda"
              name="busqueda"
              defaultValue={f.busqueda}
              placeholder="Buscar por nombre o correo"
              className={`${clasesEntrada} pl-9`}
            />
          </div>
          <label className="sr-only" htmlFor="filtro-rol">
            Rol
          </label>
          <select
            id="filtro-rol"
            name="rol"
            defaultValue={f.rol ?? ''}
            className={`${clasesEntrada} w-auto`}
          >
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETAS_ROL[r]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-estado">
            Estado
          </label>
          <select
            id="filtro-estado"
            name="estado"
            defaultValue={f.estado ?? ''}
            className={`${clasesEntrada} w-auto`}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_USUARIO.map((e) => (
              <option key={e} value={e}>
                {e === 'activo' ? 'Activas' : 'Suspendidas'}
              </option>
            ))}
          </select>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>

        {pagina.elementos.length === 0 ? (
          <EstadoVacio icono={Users} titulo="No hay personas con esos filtros" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-tinta-tenue">
                <tr className="border-b border-borde">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                    Persona
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Rol
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    2FA
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Último acceso
                  </th>
                  <th scope="col" className="w-10 px-3 py-3">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {pagina.elementos.map((u) => (
                  <tr key={u.id} className="group relative hover:bg-hundida/60">
                    <td className="px-5 py-3 sm:px-6">
                      <Link
                        href={`/admin/equipo/${u.id}`}
                        className="grid after:absolute after:inset-0"
                      >
                        <span className="font-medium">{u.nombre}</span>
                        <span className="text-xs text-tinta-tenue">{u.correo}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{ETIQUETAS_ROL[u.rol]}</td>
                    <td className="px-3 py-3">
                      {u.estado === 'activo' ? (
                        <Insignia tono="exito">Activa</Insignia>
                      ) : (
                        <Insignia tono="peligro">Suspendida</Insignia>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {u.dosPasosActivo ? (
                        <ShieldCheck className="size-4 text-exito" aria-label="Activada" />
                      ) : (
                        <ShieldAlert className="size-4 text-tinta-tenue" aria-label="Sin activar" />
                      )}
                    </td>
                    <td className="px-3 py-3 text-tinta-suave">
                      {u.ultimoAccesoEn ? haceCuanto(u.ultimoAccesoEn) : 'Nunca'}
                    </td>
                    <td className="px-3 py-3 text-tinta-tenue">
                      <ChevronRight className="size-4 group-hover:text-tinta" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacion
          ruta="/admin/equipo"
          parametros={parametros}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
