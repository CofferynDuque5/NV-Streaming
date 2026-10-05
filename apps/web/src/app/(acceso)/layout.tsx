import { enlacePoliticas, serviciosTienda } from '@nv/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarcaAcceso } from '@/componentes/acceso/marca-acceso';
import { LogoTienda } from '@/componentes/logo';
import { catalogoTienda } from '@/lib/tienda';

/**
 * Ingresar, crear cuenta y el resto del acceso: sin la navegación de la tienda
 * ni la barra inferior. En escritorio, la marca a la izquierda y la tarjeta a la
 * derecha; en el teléfono, solo la tarjeta (con una fila de marca compacta).
 */
export default async function LayoutAcceso({ children }: { children: ReactNode }) {
  const catalogo = await catalogoTienda();
  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(50%_40%_at_70%_0%,var(--nv-marca-suave),transparent),radial-gradient(40%_40%_at_100%_100%,var(--nv-acento-suave),transparent)]"
      />
      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1180px] grid-rows-[auto_1fr_auto] px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-3.5">
          <LogoTienda />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm whitespace-nowrap text-tinta-suave hover:text-tinta"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver a la tienda
          </Link>
        </header>
        <div className="grid items-center gap-5 pb-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,27.5rem)] lg:gap-14 lg:py-2.5">
          <MarcaAcceso servicios={catalogo ? serviciosTienda(catalogo) : []} />
          <main id="contenido" className="mx-auto w-full max-w-[27.5rem] lg:mx-0">
            {children}
          </main>
        </div>
        <footer className="py-5">
          <nav
            aria-label="Enlaces legales"
            className="flex flex-wrap justify-center gap-x-4.5 gap-y-1.5 text-[0.8rem] text-tinta-tenue"
          >
            <Link href={enlacePoliticas('terminos')} className="hover:text-tinta">
              Términos
            </Link>
            <Link href={enlacePoliticas('privacidad')} className="hover:text-tinta">
              Privacidad
            </Link>
            <span>© {new Date().getFullYear()} NV Streaming</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}
