import type { ResumenVentas } from '@nv/shared';
import { ArrowUpRight, Crown, Sparkles, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { TarjetasNiveles } from '@/componentes/revendedor/niveles';
import { CabeceraPanel, Kpi, Kpis, Nota, SinResumen, usd } from '@/componentes/revendedor/panel';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { leerGananciasRevendedor } from '@/lib/ganancias-revendedor';
import { leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Niveles y beneficios' };

/**
 * Los niveles de revendedor en su propia página: el nivel actual, qué falta
 * para el siguiente y lo que trae cada nivel (lo que el equipo escribe en
 * Revendedores → Niveles).
 */
export default async function NivelesRevendedor() {
  await requerirSesion({ roles: ['revendedor'] });
  const [{ estado, datos: r }, v30, ganancias] = await Promise.all([
    leerResumenRevendedor(),
    leerApi<ResumenVentas>('/revendedor/ventas/resumen?periodo=30').then((x) => x.datos),
    leerGananciasRevendedor(),
  ]);

  if (!r) {
    return (
      <>
        <CabeceraPanel titulo="Niveles y beneficios" />
        <SinResumen estado={estado} />
      </>
    );
  }

  const niveles = ganancias?.niveles ?? [];
  const indice = niveles.findIndex((n) => n.id === r.revendedor.nivel?.id);
  const actual = indice >= 0 ? niveles[indice] : null;
  const siguiente = indice >= 0 ? niveles[indice + 1] : niveles[0];
  const t30 = v30?.totales;

  return (
    <>
      <CabeceraPanel
        titulo="Niveles y beneficios"
        descripcion="Mientras más vendes, mejor precio pagas y más beneficios tienes."
      />

      <section
        aria-label="Tu nivel"
        className="relative grid gap-5 overflow-hidden rounded-[1.5rem] border border-marca/40 bg-[radial-gradient(120%_140%_at_0%_0%,rgb(79_141_255/0.28),transparent_55%),radial-gradient(90%_120%_at_100%_100%,rgb(232_121_249/0.22),transparent_60%),rgb(10_14_34/0.9)] p-6 md:grid-cols-[1fr_auto] md:items-center"
      >
        <div className="grid gap-2">
          <span className="text-[0.7rem] font-bold tracking-[0.16em] text-cian uppercase">
            Tu nivel
          </span>
          <p className="flex items-center gap-2 font-titulo text-[clamp(1.8rem,5vw,2.6rem)] leading-none font-extrabold">
            <Crown className="size-8 text-[#fde68a]" aria-hidden="true" />
            {r.revendedor.nivel?.nombre ?? 'Por asignar'}
          </p>
          {actual?.margenPromedio != null && (
            <p className="text-tinta-suave">
              Ganas en promedio <b className="text-exito tabular-nums">{actual.margenPromedio}%</b>{' '}
              del precio al público en cada venta.
            </p>
          )}
        </div>
        {siguiente ? (
          <div className="grid max-w-sm gap-2 rounded-2xl border border-white/10 bg-black/30 p-4">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="size-4 text-cian" aria-hidden="true" />
              Siguiente: {siguiente.nombre}
            </span>
            {siguiente.requisito && (
              <p className="text-sm text-tinta-suave">Para llegar: {siguiente.requisito}</p>
            )}
            {siguiente.margenPromedio != null && (
              <p className="text-sm text-tinta-suave">
                Pasas a ganar en promedio{' '}
                <b className="text-exito tabular-nums">{siguiente.margenPromedio}%</b>.
              </p>
            )}
          </div>
        ) : (
          actual && (
            <p className="flex max-w-sm items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
              <Sparkles className="size-4 text-[#fde68a]" aria-hidden="true" />
              Estás en el nivel más alto. ¡Gracias por vender con NV!
            </p>
          )
        )}
      </section>

      <Kpis>
        <Kpi titulo="Ventas · 30 días" valor={t30 ? t30.ventas : '—'} />
        <Kpi titulo="Pagado · 30 días" valor={t30 ? usd(t30.pagadoUsd) : '—'} />
        <Kpi titulo="Ganancia · 30 días" valor={t30 ? usd(t30.gananciaUsd) : '—'} tono="ok" />
        <Kpi titulo="Ventas totales" valor={r.revendedor.compras} />
      </Kpis>

      <section aria-labelledby="titulo-escalera" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="titulo-escalera" className="text-xl">
            Todos los niveles
          </h2>
          <Link href="/revendedores/ganancias" className={claseEnlace}>
            Lo que ganas en cada plan{' '}
            <ArrowUpRight className="inline size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {niveles.length > 0 ? (
          <TarjetasNiveles niveles={niveles} actualId={r.revendedor.nivel?.id} />
        ) : (
          <Alerta tono="info" titulo="Todavía no hay niveles publicados">
            El equipo de NV los está preparando.
          </Alerta>
        )}
      </section>

      <Nota>
        El equipo revisa los niveles cada mes según tus ventas. Si crees que ya cumples el
        siguiente, escríbenos por Soporte.
      </Nota>
    </>
  );
}
