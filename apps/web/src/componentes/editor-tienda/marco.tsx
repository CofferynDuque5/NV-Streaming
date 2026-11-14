'use client';

import clsx from 'clsx';
import { ArrowLeft, ExternalLink, FileText, Layers, Palette, Phone } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface PestanaEditor {
  etiqueta: string;
  href: string;
  icono: 'paginas' | 'servicios' | 'apariencia' | 'contacto';
}

const ICONOS = { paginas: FileText, servicios: Layers, apariencia: Palette, contacto: Phone };

/** Rutas que se ven a pantalla completa, con su propia barra (el editor de bloques). */
const PANTALLA_COMPLETA = '/editor/paginas/';

/**
 * Marco del editor de la tienda: un panel aparte del de administración, con
 * sus pestañas arriba (páginas, servicios, apariencia y contacto), el enlace a
 * la tienda y la vuelta al panel. El editor de bloques ocupa toda la pantalla.
 */
export function MarcoEditorTienda({
  pestanas,
  marca,
  children,
}: {
  pestanas: PestanaEditor[];
  marca: ReactNode;
  children: ReactNode;
}) {
  const ruta = usePathname() ?? '';
  const completa = ruta.startsWith(PANTALLA_COMPLETA);
  const activa = (href: string) =>
    href === '/editor'
      ? ruta === '/editor' || ruta.startsWith('/editor/vista')
      : ruta === href || ruta.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh">
      {!completa && (
        <header className="vidrio sticky top-0 z-40 border-x-0 border-t-0">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 nav:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              {marca}
              <span className="hidden h-6 w-px bg-borde sm:block" aria-hidden="true" />
              <b className="text-sm font-bold whitespace-nowrap sm:text-base">
                Editor de la tienda
              </b>
            </div>
            <nav
              aria-label="Secciones del editor"
              className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:order-none md:mx-auto md:w-auto"
            >
              {pestanas.map((p) => {
                const Icono = ICONOS[p.icono];
                const esActiva = activa(p.href);
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={esActiva ? 'page' : undefined}
                    className={clsx(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors',
                      esActiva
                        ? 'bg-marca/[0.2] text-tinta shadow-[inset_0_0_0_1px_rgb(79_141_255/0.45)]'
                        : 'text-tinta-suave hover:bg-white/[0.05] hover:text-tinta',
                    )}
                  >
                    <Icono
                      className={clsx('size-4', esActiva ? 'text-cian' : 'text-tinta-tenue')}
                      aria-hidden="true"
                    />
                    {p.etiqueta}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-borde px-3 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
              >
                <ExternalLink className="size-4 text-cian" aria-hidden="true" />
                <span className="max-sm:sr-only">Ver tienda</span>
              </a>
              <Link
                href="/admin"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-borde px-3 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Volver al panel</span>
              </Link>
            </div>
          </div>
        </header>
      )}
      <main
        id="contenido"
        className={clsx(
          'mx-auto grid w-full min-w-0 grid-cols-[minmax(0,1fr)] content-start',
          completa
            ? 'max-w-[1640px] gap-3.5 px-4 pt-3.5 pb-5 sm:px-6'
            : 'max-w-[1440px] gap-5.5 px-4 pt-6 pb-14 sm:px-6 nav:px-8',
        )}
      >
        {children}
      </main>
    </div>
  );
}
