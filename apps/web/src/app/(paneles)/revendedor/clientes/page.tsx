import { listarCarteraSchema, type OrdenCartera, type PaginaCartera } from '@nv/shared';
import { Plus, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { claseEnlace, Vacio } from '@/componentes/cliente/piezas-cuenta';
import { Paginacion } from '@/componentes/panel/paginacion';
import { BuscarClientes } from '@/componentes/revendedor/busqueda';
import { TablaClientes } from '@/componentes/revendedor/clientes';
import {
  AvisosRevendedor,
  CabeceraPanel,
  dirPorDefecto,
  SinResumen,
} from '@/componentes/revendedor/panel';
import { BotonEnlace } from '@/componentes/ui/boton';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { bloqueoVenta, leerResumenRevendedor } from '@/lib/panel-revendedor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Clientes' };

type Crudo = Record<string, string | string[] | undefined>;

const FILTROS = [
  ['todos', 'Todos'],
  ['por_vencer', 'Por vencer'],
  ['atrasados', 'Vencidos o en gracia'],
] as const;

/** Orden en el teléfono, donde no se ve la cabecera de la tabla. */
const ORDENES_TELEFONO: [OrdenCartera, string][] = [
  ['vence', 'Vence pronto'],
  ['total', 'Más compró'],
  ['ultima', 'Más reciente'],
  ['nombre', 'Nombre'],
];

export default async function Clientes({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['revendedor'] });
  const crudo = await searchParams;
  // Por defecto, los que vencen primero arriba.
  const { filtro, consulta, parametros } = leerFiltro(listarCarteraSchema, {
    orden: 'vence',
    ...crudo,
  });
  const [{ estado, datos: resumen }, { datos: pagina }] = await Promise.all([
    leerResumenRevendedor(),
    leerApi<PaginaCartera>(`/revendedor/clientes?${consulta}`),
  ]);

  if (!resumen || !pagina) {
    return (
      <>
        <CabeceraPanel titulo="Clientes" />
        <SinResumen estado={resumen ? 500 : estado} />
      </>
    );
  }

  const r = resumen.revendedor;
  const bloqueo = bloqueoVenta(r);
  if (r.clientes === 0) {
    return (
      <>
        <CabeceraPanel titulo="Clientes" descripcion="Tu cartera se arma sola con cada venta." />
        <AvisosRevendedor revendedor={r} soloEstado />
        <Vacio
          icono={<UsersRound className="size-5" aria-hidden="true" />}
          color="#a855f7"
          titulo="Todavía no tienes clientes"
          accion={
            bloqueo ? undefined : <BotonEnlace href="/revendedor/catalogo">Nueva venta</BotonEnlace>
          }
        >
          Haz tu primera venta desde Nueva venta.
        </Vacio>
      </>
    );
  }

  const dir = filtro.dir ?? dirPorDefecto(filtro.orden);
  const enlace = (cambios: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries({
        busqueda: filtro.busqueda,
        filtro: filtro.filtro,
        orden: filtro.orden,
        dir: filtro.dir,
        ...cambios,
      }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `/revendedor/clientes${q.size ? `?${q}` : ''}`;
  };

  return (
    <>
      <CabeceraPanel
        titulo="Clientes"
        descripcion={`${r.clientes === 1 ? '1 cliente' : `${r.clientes} clientes`} · toca uno para ver su ficha.`}
        accion={
          <BotonEnlace href="/revendedor/catalogo" variante="secundario">
            <Plus className="size-4" aria-hidden="true" /> Vender a un cliente
          </BotonEnlace>
        }
      />
      <AvisosRevendedor revendedor={r} soloEstado />
      <div className="flex flex-wrap items-center gap-3">
        <BuscarClientes inicial={filtro.busqueda ?? ''} />
        <nav aria-label="Filtrar clientes" className="flex flex-wrap gap-2">
          {FILTROS.map(([f, texto]) => (
            <Link
              key={f}
              href={enlace({ filtro: f === 'todos' ? undefined : f })}
              scroll={false}
              replace
              className="chip"
              aria-current={(filtro.filtro ?? 'todos') === f ? 'page' : undefined}
            >
              {texto} · {pagina.conteos[f]}
            </Link>
          ))}
        </nav>
      </div>
      <nav
        aria-label="Ordenar"
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] min-[43.75rem]:hidden"
      >
        <span className="shrink-0 text-xs font-semibold text-tinta-tenue">Ordenar</span>
        {ORDENES_TELEFONO.map(([o, texto]) => (
          <Link
            key={o}
            href={enlace({ orden: o, dir: undefined })}
            scroll={false}
            replace
            className="chip shrink-0"
            aria-current={filtro.orden === o ? 'page' : undefined}
          >
            {texto}
          </Link>
        ))}
      </nav>

      {pagina.elementos.length === 0 ? (
        <Vacio>
          Ningún cliente coincide.{' '}
          <Link href="/revendedor/clientes" className={claseEnlace}>
            Limpiar búsqueda
          </Link>
        </Vacio>
      ) : (
        <TablaClientes
          clientes={pagina.elementos}
          orden={filtro.orden}
          dir={dir}
          parametros={parametros}
          saldoUsd={r.saldoUsd}
          bloqueo={bloqueo}
          comercial={r.nombreComercial}
        />
      )}
      <Paginacion
        ruta="/revendedor/clientes"
        parametros={parametros}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
      />
    </>
  );
}
