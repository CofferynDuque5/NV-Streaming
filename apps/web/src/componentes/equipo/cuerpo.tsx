'use client';

import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Cuerpo del panel del equipo: el menú lateral fijo y el contenido a su lado,
 * a todo el ancho. Bajo `pantallaCompleta` (el editor de páginas) el contenido
 * ocupa toda la pantalla, sin menú ni pestañas.
 */
export function CuerpoEquipo({
  lateral,
  barraInferior,
  pantallaCompleta,
  children,
}: {
  lateral: ReactNode;
  barraInferior: ReactNode;
  /** Prefijo de las rutas *hijas* que se ven a todo el ancho. */
  pantallaCompleta: string;
  children: ReactNode;
}) {
  const ruta = usePathname() ?? '';
  const completa = ruta.startsWith(pantallaCompleta) && ruta.length > pantallaCompleta.length;
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
          {children}
        </main>
      </div>
      {!completa && barraInferior}
    </>
  );
}
