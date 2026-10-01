import type { SesionActual } from '@nv/shared';
import { Store } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoTienda } from '@/componentes/logo';
import { navegacionCuenta } from '@/lib/navegacion';
import { leerPanelCliente } from '@/lib/panel-cliente';
import { Avatar, iniciales } from './avatar';
import { MenuCuenta, SalirCuenta } from './menu-cuenta';

/**
 * Marco de la cuenta (cliente y revendedor): cabecera con la marca y, debajo,
 * el menú (columna con la tarjeta de quien entra en escritorio, pastillas en
 * el teléfono) junto al contenido de cada página.
 */
export function MarcoCuenta({
  pastilla,
  tarjeta,
  menu,
  children,
  sello,
  acciones,
  barraInferior,
}: {
  /**
   * Nombre corto de la cabecera. Sin `href` solo se ve en escritorio; con
   * `href` es un enlace (en el teléfono, solo el avatar).
   */
  pastilla: { letras: string; nombre: string; href?: string };
  /** Tarjeta sobre el menú: iniciales, título y líneas debajo. */
  tarjeta: { letras: string; titulo: string; lineas: ReactNode[] };
  menu: ReactNode;
  children: ReactNode;
  /** Junto al logo (p. ej. «Revendedor»). */
  sello?: ReactNode;
  /** Enlaces de la cabecera antes de la pastilla; por defecto, «Tienda». */
  acciones?: ReactNode;
  /** Barra de pestañas fija del teléfono. */
  barraInferior?: ReactNode;
}) {
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
          {sello ? (
            <div className="mr-auto flex min-w-0 items-center gap-2.5">
              <LogoTienda compacto />
              {sello}
            </div>
          ) : (
            <LogoTienda className="mr-auto" />
          )}
          {acciones ?? (
            <Link
              href="/catalogo"
              className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] border border-borde px-3 text-sm font-semibold whitespace-nowrap text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
            >
              <Store className="size-4 text-cian" aria-hidden="true" />
              <span className="max-[380px]:sr-only">Tienda</span>
            </Link>
          )}
          {pastilla.href ? (
            <Link
              href={pastilla.href}
              aria-label={`${pastilla.nombre}, perfil`}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-borde-fuerte bg-white/[0.03] p-1 text-sm font-semibold whitespace-nowrap hover:border-cian sm:pr-3"
            >
              <Avatar letras={pastilla.letras} className="size-8 text-[0.8rem]" />
              <span className="max-sm:hidden">{pastilla.nombre}</span>
            </Link>
          ) : (
            <span
              className="hidden h-10 items-center gap-2 rounded-full border border-borde-fuerte bg-white/[0.03] py-1 pr-3 pl-1 text-sm font-semibold whitespace-nowrap nav:inline-flex"
              aria-hidden="true"
            >
              <Avatar letras={pastilla.letras} className="size-8 text-[0.8rem]" />
              {pastilla.nombre}
            </span>
          )}
          <SalirCuenta />
        </div>
      </header>
      <div className="contenedor grid grid-cols-[minmax(0,1fr)] items-start gap-4.5 pt-5 pb-12 cuenta:grid-cols-[15.625rem_minmax(0,1fr)] cuenta:gap-7 cuenta:pt-8">
        <aside className="grid min-w-0 gap-3.5 cuenta:sticky cuenta:top-[5.25rem]">
          <div className="hidden items-center gap-3 rounded-[1.25rem] border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(8_11_26/0.96))] p-3.5 cuenta:flex">
            <Avatar letras={tarjeta.letras} className="size-11 text-[1.05rem]" />
            <div className="grid min-w-0 gap-0.5">
              <b className="truncate text-[0.95rem]">{tarjeta.titulo}</b>
              {tarjeta.lineas.map((l, i) => (
                <span key={i} className="truncate text-[0.8rem] text-tinta-suave">
                  {l}
                </span>
              ))}
            </div>
          </div>
          {menu}
        </aside>
        <main id="contenido" className="grid min-w-0 content-start gap-5.5">
          {children}
        </main>
      </div>
      {barraInferior}
    </div>
  );
}

/** Cuenta del cliente: su tarjeta y el menú con sus pendientes. */
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
  const p = panel?.pendientes;

  return (
    <MarcoCuenta
      pastilla={{ letras: iniciales(usuario.nombre), nombre: usuario.nombre.split(' ')[0]! }}
      tarjeta={{
        letras: iniciales(usuario.nombre),
        titulo: usuario.nombre,
        lineas: [usuario.correo, revendedor ? `Cliente de ${revendedor.nombre}` : 'Cliente'],
      }}
      menu={
        // La API ya no cuenta las facturas de lo que gestiona su revendedor.
        <MenuCuenta
          grupos={grupos}
          contadores={
            p
              ? {
                  accesos: p.accesosSinVer,
                  facturas: p.facturasPorPagar,
                  soporte: p.ticketsPorResponder,
                }
              : {}
          }
        />
      }
    >
      {children}
    </MarcoCuenta>
  );
}
