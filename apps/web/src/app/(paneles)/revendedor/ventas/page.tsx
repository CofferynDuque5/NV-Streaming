import {
  type FiltroVentas,
  formatearMonto,
  listarVentasSchema,
  type PaginaVentas,
  type PeriodoVentas,
} from '@nv/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { claseEnlace, Vacio } from '@/componentes/cliente/piezas-cuenta';
import { CabeceraPanel, Kpi, Kpis, Nota, SinResumen, usd } from '@/componentes/revendedor/panel';
import { TablaVentas } from '@/componentes/revendedor/ventas';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ventas' };

type Crudo = Record<string, string | string[] | undefined>;

const PERIODOS: [PeriodoVentas, string][] = [
  ['hoy', 'Hoy'],
  ['7', '7 días'],
  ['30', '30 días'],
];

const TIPOS: [FiltroVentas, string][] = [
  ['todas', 'Todas'],
  ['alta', 'Activaciones'],
  ['renovacion', 'Renovaciones'],
  ['reembolsada', 'Reembolsadas'],
];

const POR_PAGINA = 15;

export default async function Ventas({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['revendedor'] });
  const { filtro } = leerFiltro(listarVentasSchema, await searchParams);
  const consulta = `periodo=${filtro.periodo}&tipo=${filtro.tipo}`;
  const [{ estado, datos: resumen }, { datos: pagina }] = await Promise.all([
    leerResumenRevendedor(),
    leerApi<PaginaVentas>(`/revendedor/ventas?${consulta}&porPagina=${POR_PAGINA}`),
  ]);
  const cabecera = (descripcion: string) => (
    <CabeceraPanel titulo="Ventas" descripcion={descripcion} />
  );

  if (!resumen || !pagina) {
    return (
      <>
        {cabecera('Lo que pagaste con tu saldo y lo que ganarías al precio público.')}
        <SinResumen estado={resumen ? 500 : estado} />
      </>
    );
  }
  if (resumen.revendedor.compras === 0) {
    return (
      <>
        {cabecera('Cada activación y renovación que pagaste con tu saldo.')}
        <Vacio>
          Todavía no has vendido.{' '}
          <Link href="/revendedor/catalogo" className={claseEnlace}>
            Hacer una venta
          </Link>
        </Vacio>
      </>
    );
  }

  const t = pagina.totales;
  const tasa = resumen.tasaVes;
  const enlace = (periodo: PeriodoVentas, tipo: FiltroVentas) => {
    const q = new URLSearchParams();
    if (periodo !== '30') q.set('periodo', periodo);
    if (tipo !== 'todas') q.set('tipo', tipo);
    return `/revendedor/ventas${q.size ? `?${q}` : ''}`;
  };
  const pct =
    Number(t.pagadoUsd) > 0
      ? Math.round((Number(t.gananciaUsd) / Number(t.pagadoUsd)) * 100)
      : null;

  return (
    <>
      {cabecera('Lo que pagaste con tu saldo y lo que ganarías al precio público.')}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <nav aria-label="Periodo" className="flex flex-wrap gap-2">
          {PERIODOS.map(([p, texto]) => (
            <Link
              key={p}
              href={enlace(p, filtro.tipo)}
              scroll={false}
              replace
              className="chip"
              aria-current={filtro.periodo === p ? 'page' : undefined}
            >
              {texto}
            </Link>
          ))}
        </nav>
        <nav aria-label="Tipo" className="flex flex-wrap gap-2">
          {TIPOS.map(([k, texto]) => (
            <Link
              key={k}
              href={enlace(filtro.periodo, k)}
              scroll={false}
              replace
              className="chip"
              aria-current={filtro.tipo === k ? 'page' : undefined}
            >
              {texto} · {pagina.conteos[k]}
            </Link>
          ))}
        </nav>
      </div>

      {filtro.tipo === 'reembolsada' ? (
        <Kpis dos>
          <Kpi titulo="Reembolsadas" valor={t.reembolsadas} detalle="Las hace el equipo" />
          <Kpi titulo="Te devolvimos" valor={usd(t.reembolsadoUsd)} detalle="Volvió a tu saldo" />
        </Kpis>
      ) : (
        <Kpis>
          <Kpi
            titulo="Ventas"
            valor={t.ventas}
            detalle={
              t.reembolsadas
                ? `${t.reembolsadas} ${t.reembolsadas === 1 ? 'reembolsada' : 'reembolsadas'}`
                : 'Sin reembolsos'
            }
          />
          <Kpi
            titulo="Pagaste"
            valor={usd(t.pagadoUsd)}
            detalle={
              tasa
                ? `≈ ${formatearMonto((Number(t.pagadoUsd) * Number(tasa)).toFixed(2), 'VES')}`
                : undefined
            }
          />
          <Kpi titulo="Al público" valor={usd(t.publicoUsd)} detalle="Lo que cobra la tienda" />
          <Kpi
            titulo="Ganancia estimada"
            valor={usd(t.gananciaUsd)}
            detalle={pct !== null ? `${pct}% sobre lo que pagaste` : '—'}
            tono="ok"
          />
        </Kpis>
      )}

      {pagina.elementos.length === 0 ? (
        <Vacio>No hay ventas con este filtro.</Vacio>
      ) : (
        <TablaVentas key={consulta} inicial={pagina} consulta={consulta} />
      )}
      <Nota>
        Los reembolsos los hace el equipo y el dinero vuelve a tu saldo. La ganancia es una
        estimación: supone que cobraste el precio público de hoy.
      </Nota>
    </>
  );
}
