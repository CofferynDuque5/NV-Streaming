import { listarAuditoriaSchema, type Pagina, type RegistroAuditoria } from '@nv/shared';
import { FileClock } from 'lucide-react';
import type { Metadata } from 'next';
import { Paginacion } from '@/componentes/panel/paginacion';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { ACCIONES_AUDITORIA, formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Auditoría' };

const GRUPOS = [
  ['', 'Todas las acciones'],
  ['sesion.', 'Sesiones'],
  ['usuario.', 'Usuarios'],
  ['contrasena.', 'Contraseñas'],
  ['dos_pasos.', 'Verificación en dos pasos'],
] as const;

function actorDe(e: RegistroAuditoria) {
  if (e.actor) return e.actor.nombre;
  return e.actorTipo === 'sistema'
    ? 'Sistema'
    : e.actorTipo === 'ia'
      ? 'Asistente IA'
      : 'Desconocido';
}

export default async function Auditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'auditoria.ver' });
  const crudo = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v));
  const filtro = listarAuditoriaSchema.safeParse({ ...crudo, porPagina: 25 });
  const f = filtro.success ? filtro.data : listarAuditoriaSchema.parse({ porPagina: 25 });
  const q = new URLSearchParams(
    Object.entries({
      accion: f.accion,
      pagina: String(f.pagina),
      porPagina: String(f.porPagina),
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const { datos } = await leerApi<Pagina<RegistroAuditoria>>(`/auditoria?${q}`);
  const pagina = datos ?? { elementos: [], total: 0, pagina: 1, porPagina: 25 };

  return (
    <>
      <CabeceraPagina
        titulo="Auditoría"
        descripcion="Registro inalterable de las acciones sensibles: quién hizo qué, cuándo y desde dónde. Nadie puede editarlo ni borrarlo, ni siquiera desde la base de datos."
      />
      <Tarjeta>
        <form className="flex flex-wrap items-end gap-3 border-b border-borde px-5 py-4 sm:px-6">
          <label htmlFor="accion" className="sr-only">
            Tipo de acción
          </label>
          <select
            id="accion"
            name="accion"
            defaultValue={f.accion ?? ''}
            className={`${clasesEntrada} w-auto`}
          >
            {GRUPOS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
          <p className="ml-auto text-sm text-tinta-tenue">{pagina.total} registros</p>
        </form>
        {pagina.elementos.length === 0 ? (
          <EstadoVacio icono={FileClock} titulo="No hay registros con ese filtro" />
        ) : (
          <ul className="divide-y divide-borde">
            {pagina.elementos.map((e) => (
              <li key={e.id}>
                <details className="group px-5 py-3 sm:px-6">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-52 flex-1 text-sm font-medium">
                      {ACCIONES_AUDITORIA[e.accion] ?? e.accion}
                    </span>
                    <span className="text-sm text-tinta-suave">{actorDe(e)}</span>
                    <time dateTime={e.fecha} className="w-40 text-right text-xs text-tinta-tenue">
                      {formatearFechaHora(e.fecha)}
                    </time>
                  </summary>
                  <dl className="mt-3 grid gap-2 rounded-xl bg-hundida p-4 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-tinta-tenue">Acción</dt>
                      <dd className="font-mono">{e.accion}</dd>
                    </div>
                    <div>
                      <dt className="text-tinta-tenue">Entidad</dt>
                      <dd className="font-mono break-all">
                        {e.entidad}
                        {e.entidadId ? ` · ${e.entidadId}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-tinta-tenue">Actor</dt>
                      <dd>{e.actor ? `${e.actor.nombre} (${e.actor.correo})` : actorDe(e)}</dd>
                    </div>
                    <div>
                      <dt className="text-tinta-tenue">IP</dt>
                      <dd className="font-mono">{e.ip ?? '—'}</dd>
                    </div>
                    {e.antes !== null && (
                      <div className="sm:col-span-2">
                        <dt className="text-tinta-tenue">Antes</dt>
                        <dd className="font-mono break-all">{JSON.stringify(e.antes)}</dd>
                      </div>
                    )}
                    {e.despues !== null && (
                      <div className="sm:col-span-2">
                        <dt className="text-tinta-tenue">Después</dt>
                        <dd className="font-mono break-all">{JSON.stringify(e.despues)}</dd>
                      </div>
                    )}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Paginacion
          ruta="/admin/auditoria"
          parametros={{ accion: f.accion }}
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
        />
      </Tarjeta>
    </>
  );
}
