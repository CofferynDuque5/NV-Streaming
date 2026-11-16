import {
  aspectoServicio,
  INFO_CATEGORIA,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
} from '@nv/shared';
import clsx from 'clsx';
import { EyeOff, Flame, Layers, Pencil, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NuevoServicio } from '@/componentes/admin/editor-vitrina';
import { CampoBuscarServidor } from '@/componentes/admin/buscar-servicios';
import { ArteServicio } from '@/componentes/tienda/arte';
import { Alerta } from '@/componentes/ui/alerta';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { leerApi } from '@/lib/api-servidor';
import { formatearMonto } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Servicios' };

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Cuadrícula de servicios, como el editor anterior: se abre cada uno por pestañas. */
export default async function Servicios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'catalogo.gestionar' });
  const { q = '' } = await searchParams;
  const [rServicios, rProveedores, rPlanes] = await Promise.all([
    leerApi<ServicioPublico[]>('/catalogo/servicios'),
    leerApi<ProveedorPublico[]>('/catalogo/proveedores'),
    leerApi<PlanPublico[]>('/catalogo/planes'),
  ]);
  if (!rServicios.datos || !rProveedores.datos) {
    return (
      <Alerta tono="peligro" titulo="No pudimos cargar los servicios">
        Recarga la página en unos segundos.
      </Alerta>
    );
  }
  const planes = rPlanes.datos ?? [];
  const buscado = normalizar(q.trim());
  const servicios = rServicios.datos.filter(
    (s) => !buscado || normalizar(`${s.nombre} ${s.slug}`).includes(buscado),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[clamp(1.625rem,4.4vw,2.375rem)]">Servicios</h1>
          <p className="text-tinta-suave">
            {rServicios.datos.filter((s) => s.activo).length} activos de {rServicios.datos.length}.
            Abre uno para editar sus datos, precios, imágenes, preguntas y comentarios.
          </p>
        </div>
        <NuevoServicio proveedores={rProveedores.datos} />
      </div>
      <CampoBuscarServidor valor={q} />

      {servicios.length === 0 ? (
        <EstadoVacio
          icono={Layers}
          titulo={q ? 'Ningún servicio coincide' : 'Todavía no hay servicios'}
        >
          {q ? 'Prueba con otro nombre.' : 'Crea el primero con «Nuevo servicio».'}
        </EstadoVacio>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[110rem]:grid-cols-4">
          {servicios.map((s) => {
            const suyos = planes.filter((p) => p.servicio.id === s.id);
            const enVenta = suyos.filter((p) => p.activo && p.visible);
            const desde = enVenta.length
              ? Math.min(...enVenta.map((p) => Number(p.precioUsd)))
              : null;
            const v = s.vitrina;
            const aspecto = aspectoServicio(s.slug, s.categoria, null);
            return (
              <li key={s.id}>
                <Link
                  href={`/editor/servicios/${s.id}`}
                  aria-label={`Editar ${s.nombre}`}
                  className={clsx(
                    'group relative grid h-full overflow-hidden rounded-[1.25rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.75),rgb(8_11_26/0.9))] transition-colors hover:border-borde-fuerte',
                    !s.activo && 'opacity-60',
                  )}
                >
                  <div
                    className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-hundida"
                    style={{
                      backgroundImage: `radial-gradient(circle at 50% 120%, ${aspecto.color}55, transparent 70%)`,
                    }}
                  >
                    {v.portadaId && (
                      <img
                        src={`/api/v1/sitio/publico/medios/${v.portadaId}`}
                        alt=""
                        className="absolute inset-0 size-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    {s.imagen ? (
                      <img
                        src={s.imagen.url}
                        alt=""
                        className={clsx(
                          'relative max-h-[60%] max-w-[70%] object-contain drop-shadow-lg',
                          v.invertirLogo && 'invert',
                        )}
                      />
                    ) : (
                      <div className="absolute inset-x-0 top-[8%] flex h-[84%] justify-center transition-transform duration-500 group-hover:-translate-y-1">
                        <ArteServicio
                          arte={aspecto.arte}
                          nombre={s.nombre}
                          categoria={s.categoria}
                          color={aspecto.color}
                          className="h-full w-auto"
                        />
                      </div>
                    )}
                    <span className="absolute top-2.5 left-2.5 flex gap-1.5">
                      {v.destacado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f97316] px-2 py-0.5 text-[0.68rem] font-extrabold text-white">
                          <Flame className="size-3" aria-hidden="true" /> HOT
                        </span>
                      )}
                      {v.nuevo && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#a78bfa] px-2 py-0.5 text-[0.68rem] font-extrabold text-white">
                          <Sparkles className="size-3" aria-hidden="true" /> NUEVO
                        </span>
                      )}
                    </span>
                    <span
                      className={clsx(
                        'absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[0.68rem] font-bold',
                        !s.activo
                          ? 'bg-white/15 text-tinta'
                          : !v.visible
                            ? 'bg-aviso/25 text-[#fde68a]'
                            : 'bg-exito/20 text-exito',
                      )}
                    >
                      {!s.activo ? 'Inactivo' : !v.visible ? 'Oculto' : 'Activo'}
                    </span>
                  </div>
                  <div className="grid gap-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate text-base">{s.nombre}</b>
                      <Pencil
                        className="size-4 shrink-0 text-tinta-tenue group-hover:text-marca"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-tinta-tenue">
                      <span>
                        {s.categoria ? INFO_CATEGORIA[s.categoria].nombre : 'Sin categoría'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {enVenta.length} de {suyos.length} planes a la venta
                      </span>
                      {!v.visible && <EyeOff className="size-3" aria-label="Oculto en la tienda" />}
                    </p>
                    <p className="mt-1 text-sm">
                      {desde !== null ? (
                        <>
                          Desde <b>{formatearMonto(desde.toFixed(2), 'USD')}</b>
                        </>
                      ) : (
                        <span className="text-[#fde68a]">Sin precios a la venta</span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
