import { formatearMonto } from '@nv/shared';
import { Wallet, Zap } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { LogoTienda } from '@/componentes/logo';
import { clasesBoton } from '@/componentes/ui/boton';
import { catalogoTienda, monedaTienda, sesionTienda } from '@/lib/tienda';
import {
  BarraInferior,
  BuscadorTienda,
  CajonMovil,
  CerrarAviso,
  FranjaCategorias,
  IconoCarrito,
  MenuMonedas,
} from './cabecera-cliente';
import { datosMenu } from './datos-menu';
import { Bandera } from './iconos';
import { COOKIE_AVISO_TASA, type OpcionMoneda, type SesionMenu } from './tipos';

/** Botón de moneda sin menú mientras carga el selector (misma medida, sin saltos). */
function MonedaEstatica({ opcion, compacto }: { opcion: OpcionMoneda; compacto?: boolean }) {
  return (
    <span className="flex h-11 items-center gap-2 rounded-[0.9rem] border border-borde px-2.5 text-sm">
      <Bandera moneda={opcion.codigo} decorativa />
      {!compacto && <b className="font-titulo">{opcion.simbolo}</b>}
    </span>
  );
}

/**
 * Cabecera «Franja» de la tienda: logo, buscador, moneda, saldo, carrito e
 * ingreso; debajo, los universos con su megamenú. En el teléfono: buscador y
 * chips bajo la fila superior, menú lateral y barra de pestañas abajo.
 */
export async function CabeceraTienda() {
  const [catalogo, moneda, sesion, almacen] = await Promise.all([
    catalogoTienda(),
    monedaTienda(),
    sesionTienda(),
    cookies(),
  ]);
  const { lista, categorias, monedas } = datosMenu(catalogo, moneda);
  const actual = monedas.find((m) => m.codigo === moneda) ?? monedas[0];
  const tasaVes = catalogo?.monedas.includes('VES')
    ? catalogo.tasas.find((t) => t.moneda === 'VES')
    : undefined;
  const mostrarAviso = Boolean(tasaVes) && !almacen.get(COOKIE_AVISO_TASA);
  const sesionMenu: SesionMenu | null = sesion
    ? {
        nombre: sesion.nombre,
        panel: sesion.panel,
        saldo: sesion.saldoUsd === null ? null : formatearMonto(sesion.saldoUsd, 'USD'),
        enlaceSaldo: sesion.enlaceSaldo,
      }
    : null;

  return (
    <>
      {mostrarAviso && tasaVes && (
        <CerrarAviso>
          <Zap className="size-3.5 shrink-0 text-aviso" aria-hidden="true" />
          <span>
            Tasa de hoy:{' '}
            <b className="text-tinta">1 USD = {formatearMonto(tasaVes.valor, 'VES')}</b>
          </span>
        </CerrarAviso>
      )}
      <header className="vidrio sticky top-0 z-40 border-x-0 border-t-0">
        <div className="contenedor">
          <div className="flex min-h-[4.25rem] items-center gap-2.5 py-2 nav:gap-3">
            <LogoTienda className="mr-auto nav:mr-2" />
            <BuscadorTienda servicios={lista} className="hidden max-w-[35rem] flex-1 nav:block" />
            {actual && (
              <>
                <div className="hidden nav:block">
                  <Suspense fallback={<MonedaEstatica opcion={actual} />}>
                    <MenuMonedas monedas={monedas} actual={actual} />
                  </Suspense>
                </div>
                <div className="nav:hidden">
                  <Suspense fallback={<MonedaEstatica opcion={actual} compacto />}>
                    <MenuMonedas monedas={monedas} actual={actual} compacto />
                  </Suspense>
                </div>
              </>
            )}
            {sesionMenu?.saldo && sesionMenu.enlaceSaldo && (
              <Link
                href={sesionMenu.enlaceSaldo}
                className="hidden h-11 items-center gap-2 rounded-[0.9rem] border border-borde bg-white/[0.02] px-3 text-sm hover:border-borde-fuerte nav:flex"
              >
                <Wallet className="size-4 text-violeta" aria-hidden="true" />
                <span className="text-tinta-suave">Saldo</span>
                <b className="tabular-nums">{sesionMenu.saldo}</b>
              </Link>
            )}
            <IconoCarrito />
            <div className="hidden nav:block">
              {sesionMenu ? (
                <Link href={sesionMenu.panel} className={clasesBoton('primario', 'md')}>
                  Mi panel
                </Link>
              ) : (
                <Link href="/ingresar" className={clasesBoton('primario', 'md')}>
                  Ingresar
                </Link>
              )}
            </div>
            <div className="nav:hidden">
              <CajonMovil
                categorias={categorias}
                monedas={monedas}
                moneda={moneda}
                sesion={sesionMenu}
                logo={<LogoTienda />}
              />
            </div>
          </div>
          <div className="grid gap-2.5 pb-3 nav:hidden">
            <BuscadorTienda servicios={lista} />
            {categorias.length > 0 && (
              <nav
                aria-label="Universos"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
              >
                <Link href="/catalogo" className="chip shrink-0">
                  Todos
                </Link>
                {categorias.map((c) => (
                  <Link key={c.id} href={`/catalogo?categoria=${c.id}`} className="chip shrink-0">
                    <i
                      className="size-2 rounded-full"
                      style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                      aria-hidden="true"
                    />
                    {c.nombre}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
        {categorias.length > 0 && (
          <div className="hidden border-t border-borde nav:block">
            <div className="contenedor">
              <FranjaCategorias categorias={categorias} />
            </div>
          </div>
        )}
      </header>
      <BarraInferior
        billetera={sesionMenu?.enlaceSaldo ?? '/cuenta/billetera'}
        cuenta={sesionMenu?.panel ?? '/ingresar'}
        saldo={sesionMenu?.enlaceSaldo ? sesionMenu.saldo : null}
      />
    </>
  );
}
