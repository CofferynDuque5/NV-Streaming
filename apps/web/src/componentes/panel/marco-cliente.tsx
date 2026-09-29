import type { SesionActual } from '@nv/shared';
import { Store } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoTienda } from '@/componentes/logo';
import { navegacionCuenta } from '@/lib/navegacion';
import { leerPanelCliente } from '@/lib/panel-cliente';
import { MenuCuenta, SalirCuenta } from './menu-cuenta';

export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Cuenta del cliente: cabecera con la marca y, debajo, el menú de la cuenta
 * (columna con la tarjeta del usuario en escritorio, pastillas en el teléfono)
 * junto al contenido de cada página.
 */
export async function MarcoCliente({
  sesion,
  children,
}: {
  sesion: SesionActual;
  children: ReactNode;
}) {
  const { usuario } = sesion;
  const panel = await leerPanelCliente();
  const revendedor = panel?.revendedor ?? null;
  const grupos = navegacionCuenta(sesion.permisos, revendedor === null);

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-superficie px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="vidrio sticky top-0 z-40 border-x-0 border-t-0">
        <div className="contenedor flex min-h-[4.25rem] items-center gap-2.5 py-2">
          <LogoTienda className="mr-auto" />
          <Link
            href="/catalogo"
            className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
          >
            <Store className="size-4 text-cian" aria-hidden="true" />
            <span className="max-[380px]:sr-only">Tienda</span>
          </Link>
          <span
            className="hidden h-10 items-center gap-2 rounded-full border border-borde-fuerte bg-white/[0.03] py-1 pr-3 pl-1 text-sm font-semibold whitespace-nowrap nav:inline-flex"
            aria-hidden="true"
          >
            <i className="grid size-8 place-items-center rounded-full bg-[linear-gradient(135deg,#3b82f6,#8b5cf6_60%,#d946ef)] font-titulo text-[0.8rem] font-extrabold text-white not-italic">
              {iniciales(usuario.nombre)}
            </i>
            {usuario.nombre.split(' ')[0]}
          </span>
          <SalirCuenta />
        </div>
      </header>
      <div className="contenedor grid grid-cols-[minmax(0,1fr)] items-start gap-4.5 pt-5 pb-12 cuenta:grid-cols-[15.625rem_minmax(0,1fr)] cuenta:gap-7 cuenta:pt-8">
        <aside className="grid min-w-0 gap-3.5 cuenta:sticky cuenta:top-[5.25rem]">
          <div className="hidden items-center gap-3 rounded-[1.25rem] border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(8_11_26/0.96))] p-3.5 cuenta:flex">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#3b82f6,#8b5cf6_60%,#d946ef)] font-titulo text-[1.05rem] font-extrabold text-white"
              aria-hidden="true"
            >
              {iniciales(usuario.nombre)}
            </span>
            <div className="grid min-w-0 gap-0.5">
              <b className="truncate text-[0.95rem]">{usuario.nombre}</b>
              <span className="truncate text-[0.8rem] text-tinta-suave">{usuario.correo}</span>
              <span className="truncate text-[0.8rem] text-tinta-suave">
                {revendedor ? `Cliente de ${revendedor.nombre}` : 'Cliente'}
              </span>
            </div>
          </div>
          <MenuCuenta
            grupos={grupos}
            pendientes={
              panel
                ? // Las facturas del cliente de un revendedor las cobra el revendedor.
                  {
                    ...panel.pendientes,
                    facturasPorPagar: revendedor ? 0 : panel.pendientes.facturasPorPagar,
                  }
                : null
            }
          />
        </aside>
        <main id="contenido" className="grid min-w-0 content-start gap-5.5">
          {children}
        </main>
      </div>
    </div>
  );
}
