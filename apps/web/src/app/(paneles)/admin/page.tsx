import {
  ETIQUETAS_ROL,
  type Pagina,
  type RegistroAuditoria,
  ROLES,
  type UsuarioPublico,
} from '@nv/shared';
import { ChartNoAxesColumn, FileClock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HojaDeRuta } from '@/componentes/panel/hoja-de-ruta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ACCIONES_AUDITORIA, haceCuanto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Resumen' };

export default async function ResumenAdmin() {
  const sesion = await requerirSesion();
  const puedeVerUsuarios = sesion.permisos.includes('usuarios.ver');
  const puedeVerAuditoria = sesion.permisos.includes('auditoria.ver');

  const [conteos, actividad] = await Promise.all([
    puedeVerUsuarios
      ? Promise.all(
          ROLES.map(async (rol) => ({
            rol,
            total:
              (await leerApi<Pagina<UsuarioPublico>>(`/usuarios?rol=${rol}&porPagina=1`)).datos
                ?.total ?? 0,
          })),
        )
      : null,
    puedeVerAuditoria
      ? leerApi<Pagina<RegistroAuditoria>>('/auditoria?porPagina=6').then(
          (r) => r.datos?.elementos ?? [],
        )
      : null,
  ]);

  return (
    <>
      <CabeceraPagina
        titulo={`Hola, ${sesion.usuario.nombre.split(' ')[0]}`}
        descripcion="Este es el centro de control de NV Streaming."
      />

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Métricas del negocio"
          descripcion="Ventas, ingresos y renovaciones."
        />
        <EstadoVacio icono={ChartNoAxesColumn} titulo="Aún no hay datos que medir">
          Las métricas aparecerán cuando se habiliten el catálogo, las suscripciones y los cobros en
          la fase 1. No mostramos cifras de ejemplo.
        </EstadoVacio>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-2">
        {conteos && (
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Personas por rol"
              accion={
                <Link
                  href="/admin/equipo"
                  className="text-sm font-medium text-marca hover:underline"
                >
                  Ver todas
                </Link>
              }
            />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-nv bg-borde sm:grid-cols-3">
              {conteos.map(({ rol, total }) => (
                <div key={rol} className="grid gap-1 bg-superficie px-5 py-4">
                  <dt className="text-xs text-tinta-tenue">{ETIQUETAS_ROL[rol]}</dt>
                  <dd className="font-titulo text-2xl font-semibold">{total}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
        )}
        {actividad && (
          <Tarjeta>
            <CabeceraTarjeta
              titulo="Actividad reciente"
              accion={
                <Link
                  href="/admin/auditoria"
                  className="text-sm font-medium text-marca hover:underline"
                >
                  Ver auditoría
                </Link>
              }
            />
            {actividad.length === 0 ? (
              <EstadoVacio icono={FileClock} titulo="Sin actividad todavía" />
            ) : (
              <ul className="divide-y divide-borde">
                {actividad.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"
                  >
                    <div className="grid min-w-0">
                      <span className="truncate text-sm">
                        {ACCIONES_AUDITORIA[e.accion] ?? e.accion}
                      </span>
                      <span className="truncate text-xs text-tinta-tenue">
                        {e.actor?.nombre ??
                          (e.actorTipo === 'sistema' ? 'Sistema' : 'Asistente IA')}
                      </span>
                    </div>
                    <time dateTime={e.fecha} className="shrink-0 text-xs text-tinta-tenue">
                      {haceCuanto(e.fecha)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>

      <HojaDeRuta actual={0} />
    </>
  );
}
