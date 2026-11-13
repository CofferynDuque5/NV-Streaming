import type { GrupoCaidas, ReporteCaidas } from '@nv/shared';
import clsx from 'clsx';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Kpi, Kpis } from '@/componentes/revendedor/panel';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFechaHora } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Reporte de caídas' };

const PERIODOS = [7, 30, 90, 365] as const;

/** «3 h», «2 días 4 h». */
function duracion(horas: number): string {
  if (horas < 24) return `${horas} h`;
  const d = Math.floor(horas / 24);
  const h = horas % 24;
  return `${d} ${d === 1 ? 'día' : 'días'}${h ? ` ${h} h` : ''}`;
}

function Grupo({ titulo, filas }: { titulo: string; filas: GrupoCaidas[] }) {
  return (
    <Tarjeta className="min-w-0">
      <CabeceraTarjeta titulo={titulo} />
      <ul className="divide-y divide-borde">
        {filas.map((g) => (
          <li
            key={g.nombre}
            className="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6"
          >
            <span className="min-w-0 truncate font-medium">{g.nombre}</span>
            <span className="text-sm whitespace-nowrap text-tinta-suave">
              <b className="text-tinta">{g.caidas}</b> {g.caidas === 1 ? 'caída' : 'caídas'} ·{' '}
              {duracion(g.horas)}
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

export default async function ReporteCaidasPagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'cuentas.ver' });
  const pedido = Number((await searchParams).dias);
  const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 30;
  const { datos } = await leerApi<ReporteCaidas>(`/cuentas/reporte-caidas?dias=${dias}`);
  const horas = datos?.caidas.reduce((s, c) => s + c.horas, 0) ?? 0;

  return (
    <>
      <CabeceraPagina
        titulo="Reporte de caídas"
        descripcion="Cada vez que una cuenta se marcó caída, cuánto tardó en volver y a cuántos clientes tocó. Sirve para ver qué plataforma o proveedor falla más."
        acciones={
          <BotonEnlace href="/admin/cuentas/reposicion" variante="secundario">
            Reponer clientes
          </BotonEnlace>
        }
      />
      <nav className="flex flex-wrap gap-2" aria-label="Período">
        {PERIODOS.map((d) => (
          <Link
            key={d}
            href={`/admin/cuentas/caidas?dias=${d}`}
            aria-current={d === dias ? 'page' : undefined}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              d === dias
                ? 'border-cian bg-acento-suave text-tinta'
                : 'border-borde text-tinta-suave hover:text-tinta',
            )}
          >
            {d === 365 ? 'Último año' : `Últimos ${d} días`}
          </Link>
        ))}
      </nav>
      {!datos ? (
        <Alerta tono="peligro">No pudimos cargar el reporte. Recarga la página.</Alerta>
      ) : datos.caidas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={ShieldCheck} titulo="Sin caídas en este período">
            Cuando marques una cuenta como caída, aparecerá aquí con su duración.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          <Kpis>
            <Kpi titulo="Caídas" valor={datos.caidas.length} />
            <Kpi
              titulo="Siguen caídas"
              valor={datos.sinResolver}
              tono={datos.sinResolver > 0 ? 'aviso' : undefined}
            />
            <Kpi titulo="Tiempo sin servicio" valor={duracion(horas)} />
            <Kpi titulo="Plataformas afectadas" valor={datos.porServicio.length} />
          </Kpis>
          <div className="grid gap-4 lg:grid-cols-2">
            <Grupo titulo="Por plataforma" filas={datos.porServicio} />
            <Grupo titulo="Por proveedor" filas={datos.porProveedor} />
          </div>
          <Tarjeta className="min-w-0">
            <CabeceraTarjeta titulo="Cada caída" descripcion="La más reciente primero." />
            <ul className="divide-y divide-borde">
              {datos.caidas.map((c) => (
                <li
                  key={`${c.cuenta.id}-${c.caidaEn}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <Link
                      href={`/admin/cuentas/${c.cuenta.id}`}
                      className="truncate font-medium hover:text-marca"
                    >
                      {c.cuenta.servicio.nombre} ·{' '}
                      <span className="font-mono">{c.cuenta.pista}</span>
                    </Link>
                    <span className="text-xs text-tinta-tenue">
                      Cayó {formatearFechaHora(c.caidaEn)}
                      {c.resueltaEn ? ` · volvió ${formatearFechaHora(c.resueltaEn)}` : ''}
                      {c.cuenta.proveedor ? ` · ${c.cuenta.proveedor}` : ''}
                      {c.clientes
                        ? ` · ${c.clientes} ${c.clientes === 1 ? 'cliente' : 'clientes'}`
                        : ''}
                    </span>
                  </div>
                  <Insignia tono={c.resueltaEn ? 'neutro' : 'peligro'}>
                    {c.resueltaEn ? duracion(c.horas) : `Caída hace ${duracion(c.horas)}`}
                  </Insignia>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      )}
    </>
  );
}
