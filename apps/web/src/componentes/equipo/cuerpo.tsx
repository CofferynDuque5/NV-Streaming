'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Cuerpo del panel del equipo: el menú lateral fijo y el contenido a su lado,
 * a todo el ancho. Bajo `pantallaCompleta`, si se indica, el contenido
 * ocupa toda la pantalla, sin menú ni pestañas.
 */
type Pestana = { etiqueta: string; href: string };

/** La sección (grupo de pestañas) y la pestaña de la ruta: la coincidencia más larga gana. */
function pestanasDeRuta(grupos: Pestana[][], ruta: string) {
  let mejor: { grupo: Pestana[]; href: string } | null = null;
  for (const grupo of grupos) {
    for (const p of grupo) {
      const coincide = ruta === p.href || ruta.startsWith(`${p.href}/`);
      if (coincide && (!mejor || p.href.length > mejor.href.length))
        mejor = { grupo, href: p.href };
    }
  }
  return mejor;
}

/** Pestañas de una sección que junta varias páginas (p. ej. Suscripciones, Vencimientos…). */
function PestanasSeccion({ grupo, activa }: { grupo: Pestana[]; activa: string }) {
  return (
    <nav
      aria-label="Pestañas de la sección"
      className="-mx-1 -mb-1.5 flex gap-1 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]"
    >
      {grupo.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.href === activa ? 'page' : undefined}
          className={clsx(
            'inline-flex h-9 shrink-0 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors',
            p.href === activa
              ? 'border-marca/50 bg-marca/[0.16] text-tinta'
              : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
          )}
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

export function CuerpoEquipo({
  lateral,
  barraInferior,
  pantallaCompleta,
  pestanas = [],
  children,
}: {
  lateral: ReactNode;
  barraInferior: ReactNode;
  /** Secciones que juntan varias páginas: se muestran como pestañas arriba del contenido. */
  pestanas?: Pestana[][];
  /** Prefijo de las rutas *hijas* que se ven a todo el ancho (ninguna por ahora). */
  pantallaCompleta?: string;
  children: ReactNode;
}) {
  const ruta = usePathname() ?? '';
  const seccion = pestanasDeRuta(pestanas, ruta);
  const completa =
    !!pantallaCompleta &&
    ruta.startsWith(pantallaCompleta) &&
    ruta.length > pantallaCompleta.length;
  return (
    <>
      {!completa && lateral}
      <div className={clsx(!completa && 'nav:pl-(--ancho-lateral)')}>
        <main
          id="contenido"
          className={clsx(
            'mx-auto grid w-full min-w-0 grid-cols-[minmax(0,1fr)] content-start',
            completa
              ? 'max-w-[1640px] gap-3.5 px-4 pt-3.5 pb-5 sm:px-6'
              : 'max-w-[1440px] gap-5.5 px-4 pt-5 pb-12 sm:px-6 nav:px-8 nav:pt-7',
          )}
        >
          {seccion && <PestanasSeccion grupo={seccion.grupo} activa={seccion.href} />}
          {children}
        </main>
      </div>
      {!completa && barraInferior}
    </>
  );
}
