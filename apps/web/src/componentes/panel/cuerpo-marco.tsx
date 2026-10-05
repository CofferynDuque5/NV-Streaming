'use client';

import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Cuerpo del marco: el menú junto al contenido y la barra de pestañas del
 * teléfono. Bajo `pantallaCompleta` (p. ej. el editor de páginas) el contenido
 * ocupa todo el ancho, sin el menú ni las pestañas, como en el diseño.
 */
export function CuerpoMarco({
  lado,
  barraInferior,
  pantallaCompleta,
  children,
}: {
  lado: ReactNode;
  barraInferior?: ReactNode;
  /** Prefijo de las rutas *hijas* que se ven a todo el ancho. */
  pantallaCompleta?: string;
  children: ReactNode;
}) {
  const ruta = usePathname() ?? '';
  const completa =
    !!pantallaCompleta &&
    ruta.startsWith(pantallaCompleta) &&
    ruta.length > pantallaCompleta.length;

  return (
    <>
      <div
        className={clsx(
          'contenedor grid grid-cols-[minmax(0,1fr)] items-start',
          completa
            ? 'max-w-[1640px] gap-3.5 pt-3.5 pb-5'
            : 'gap-4.5 pt-5 pb-12 cuenta:grid-cols-[15.625rem_minmax(0,1fr)] cuenta:gap-7 cuenta:pt-8',
        )}
      >
        {!completa && lado}
        <main
          id="contenido"
          className={clsx('grid min-w-0 content-start', completa ? 'gap-3.5' : 'gap-5.5')}
        >
          {children}
        </main>
      </div>
      {!completa && barraInferior}
    </>
  );
}
