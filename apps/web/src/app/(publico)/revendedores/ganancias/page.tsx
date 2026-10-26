import { enlacePoliticas, etiquetaDuracion, formatearMonto } from '@nv/shared';
import { CloudOff, Tag, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Migas } from '@/componentes/tienda/migas';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { leerGananciasRevendedor } from '@/lib/ganancias-revendedor';

const DESCRIPCION =
  'Cuánto gana un revendedor de NV Streaming en cada plan, según su nivel: precio al público menos el precio mayorista.';

export const metadata: Metadata = {
  title: 'Lo que ganas como revendedor',
  description: DESCRIPCION,
  openGraph: { title: 'Lo que ganas como revendedor', description: DESCRIPCION },
  alternates: { canonical: '/revendedores/ganancias' },
};

const usd = (v: string) => formatearMonto(v, 'USD');

/**
 * Lista pública de lo que gana un revendedor: por cada plan revendible, el precio
 * al público, lo que paga en cada nivel y la diferencia. Las cifras salen de los
 * precios que el equipo carga en Revendedores › Precios; nunca muestra costos.
 */
export default async function GananciasRevendedor() {
  const datos = await leerGananciasRevendedor();

  return (
    <div className="contenedor grid gap-6 pt-7 pb-16">
      <Migas pasos={[{ texto: 'Inicio', href: '/' }, { texto: 'Ganancias de revendedor' }]} />
      <header className="grid max-w-2xl gap-3">
        <h1 className="text-[clamp(2.1rem,6vw,3.4rem)] leading-[1.04]">
          Lo que <span className="texto-degradado">ganas</span> como revendedor
        </h1>
        <p className="text-tinta-suave">
          Compras cada plan al precio de tu nivel y se lo vendes a tu cliente. Tu ganancia es la
          diferencia con el precio al público. Tú decides cuánto cobras.
        </p>
      </header>

      {!datos ? (
        <EstadoVacio icono={CloudOff} titulo="No pudimos cargar las ganancias">
          Vuelve a intentarlo en unos minutos.
        </EstadoVacio>
      ) : datos.planes.length === 0 || datos.niveles.length === 0 ? (
        <EstadoVacio icono={Tag} titulo="Todavía no hay planes para revendedores">
          Cuando el equipo publique los precios mayoristas, aquí verás lo que ganas en cada plan.
        </EstadoVacio>
      ) : (
        <>
          {datos.niveles.some((n) => n.descripcion) && (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Niveles">
              {datos.niveles.map((n) => (
                <li key={n.id} className="rounded-2xl border border-borde bg-white/[0.03] p-4">
                  <p className="font-semibold">Nivel {n.nombre}</p>
                  {n.descripcion && (
                    <p className="mt-1 text-sm text-tinta-suave">{n.descripcion}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <ul className="grid gap-3" aria-label="Ganancia por plan">
            {datos.planes.map((p) => (
              <li
                key={p.id}
                className="grid gap-3 rounded-2xl border border-borde bg-white/[0.03] p-4 md:grid-cols-[minmax(0,15rem)_1fr] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.servicio.nombre}</p>
                  <p className="text-sm text-tinta-suave">
                    {p.nombre} · {etiquetaDuracion(p.duracionCantidad, p.duracionUnidad)}
                  </p>
                  <p className="mt-1 text-sm">
                    Precio al público: <b className="tabular-nums">{usd(p.precioPublicoUsd)}</b>
                  </p>
                </div>
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {datos.niveles.map((n) => {
                    const g = p.porNivel[n.id];
                    return (
                      <div
                        key={n.id}
                        className="rounded-xl border border-borde/70 px-3 py-2"
                        data-nivel={n.nombre}
                      >
                        <dt className="text-xs text-tinta-tenue">Nivel {n.nombre}</dt>
                        {g ? (
                          <dd className="grid">
                            <span className="flex items-center gap-1.5 font-semibold text-[#4ade80] tabular-nums">
                              <TrendingUp className="size-4" aria-hidden="true" />
                              Ganas {usd(g.gananciaUsd)}
                              <span className="text-xs font-normal text-tinta-suave">
                                ({g.margen} %)
                              </span>
                            </span>
                            <span className="text-xs text-tinta-suave tabular-nums">
                              Pagas {usd(g.precioUsd)}
                            </span>
                          </dd>
                        ) : (
                          <dd className="text-sm text-tinta-tenue">No disponible</dd>
                        )}
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="max-w-2xl text-sm text-tinta-suave">
        Precios en dólares, vigentes hoy; pueden cambiar. Para empezar,{' '}
        <Link href="/cuenta/revendedor" className="font-medium text-cian hover:underline">
          solicita ser revendedor
        </Link>{' '}
        desde tu cuenta. Las reglas están en{' '}
        <Link
          href={enlacePoliticas('revendedores')}
          className="font-medium text-cian hover:underline"
        >
          Políticas › Revendedores
        </Link>
        .
      </p>
    </div>
  );
}
