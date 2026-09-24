import { type CatalogoPublico, INFO_MONEDA } from '@nv/shared';
import { ArrowRight, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  agruparPorServicio,
  monedaValida,
  SelectorMoneda,
  TarjetaPlan,
} from '@/componentes/planes';
import { BotonEnlace } from '@/componentes/ui/boton';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { nombrePais } from '@/lib/formato';
import { ubicacionVisitante } from '@/lib/ubicacion';

export const metadata: Metadata = {
  title: 'Planes y precios',
  description:
    'Planes de servicios autorizados de NV Streaming con precios en dólares, bolívares, pesos, soles y euros.',
};

// El catálogo cambia poco: se regenera cada 5 minutos para que la página cargue al instante.
export const revalidate = 300;

async function leerCatalogo(): Promise<CatalogoPublico | null> {
  try {
    const r = await fetch(
      `${process.env.API_URL_INTERNA ?? 'http://localhost:4000'}/api/v1/catalogo`,
      {
        next: { revalidate: 300 },
      },
    );
    return r.ok ? ((await r.json()) as CatalogoPublico) : null;
  } catch {
    return null;
  }
}

export default async function Planes({
  searchParams,
}: {
  searchParams: Promise<{ moneda?: string }>;
}) {
  const [catalogo, { moneda: pedida }, ubicacion] = await Promise.all([
    leerCatalogo(),
    searchParams,
    ubicacionVisitante(),
  ]);
  const monedas = catalogo?.monedas ?? ['USD'];
  const moneda = monedaValida(monedas, pedida, ubicacion.moneda);
  const porUbicacion =
    !pedida &&
    moneda === ubicacion.moneda &&
    (ubicacion.origen === 'conexion' || ubicacion.origen === 'idioma') &&
    ubicacion.pais !== null;
  const grupos = agruparPorServicio(catalogo?.planes ?? []);

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--nv-marca-suave),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-20 sm:px-6 lg:pt-20">
        <header className="grid max-w-2xl gap-4">
          <p className="text-sm font-semibold text-marca">Planes y precios</p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
            Elige tu plan y paga en tu moneda
          </h1>
          <p className="text-lg text-tinta-suave">
            Solo servicios autorizados. Paga por transferencia o pago móvil y activamos tu servicio
            en cuanto confirmamos el pago.
          </p>
          <SelectorMoneda monedas={monedas} actual={moneda} ruta="/planes" />
          {porUbicacion && ubicacion.pais && (
            <p className="text-sm text-tinta-suave">
              Te mostramos los precios en {moneda} ({INFO_MONEDA[moneda].nombre}) porque parece que
              estás en {nombrePais(ubicacion.pais)}. Puedes elegir otra moneda arriba.
            </p>
          )}
          {moneda !== 'USD' && (
            <p className="text-xs text-tinta-tenue">
              Los precios en {moneda} se calculan con la tasa del día y pueden cambiar. El importe
              exacto queda fijado en tu factura.
            </p>
          )}
        </header>

        {grupos.length === 0 ? (
          <div className="rounded-nv border border-borde bg-superficie shadow-nv">
            <EstadoVacio icono={Layers} titulo="Estamos preparando el catálogo">
              Vuelve pronto o crea tu cuenta y te avisaremos cuando haya planes disponibles.
            </EstadoVacio>
          </div>
        ) : (
          grupos.map((g) => (
            <div key={g.servicio.id} className="grid gap-5">
              <h2 className="text-2xl font-semibold">{g.servicio.nombre}</h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.planes.map((p) => (
                  <TarjetaPlan
                    key={p.id}
                    plan={p}
                    moneda={moneda}
                    accion={
                      <BotonEnlace
                        href={`/cuenta/planes?plan=${p.id}&moneda=${moneda}`}
                        className="w-full"
                      >
                        Elegir este plan <ArrowRight className="size-4" aria-hidden="true" />
                      </BotonEnlace>
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <p className="text-sm text-tinta-tenue">
          ¿Ya tienes cuenta?{' '}
          <Link
            href="/ingresar?siguiente=/cuenta/planes"
            className="font-medium text-marca hover:underline"
          >
            Entra y contrata desde tu panel
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
