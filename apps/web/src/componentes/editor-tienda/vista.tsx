'use client';

import clsx from 'clsx';
import { ArrowLeft, ExternalLink, Monitor, RotateCw, Smartphone, Tablet } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

const ANCHOS = [
  { clave: 'escritorio', etiqueta: 'Escritorio', ancho: null, Icono: Monitor },
  { clave: 'tableta', etiqueta: 'Tableta', ancho: 768, Icono: Tablet },
  { clave: 'movil', etiqueta: 'Móvil', ancho: 390, Icono: Smartphone },
] as const;

/** Vista previa en vivo de una página de la tienda, en el ancho que elijas. */
export function VistaPagina({ ruta, titulo }: { ruta: string; titulo: string }) {
  const [ancho, setAncho] = useState<(typeof ANCHOS)[number]['clave']>('escritorio');
  const marco = useRef<HTMLIFrameElement>(null);
  const elegido = ANCHOS.find((a) => a.clave === ancho)!;

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/editor"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-borde px-3 text-sm font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Páginas
        </Link>
        <h1 className="flex min-w-0 items-baseline gap-2 text-xl">
          {titulo}
          <code className="truncate font-mono text-sm font-normal text-tinta-tenue">{ruta}</code>
        </h1>
        <div
          role="group"
          aria-label="Ancho de la vista previa"
          className="ml-auto flex gap-1 rounded-xl border border-borde p-1"
        >
          {ANCHOS.map(({ clave, etiqueta, Icono }) => (
            <button
              key={clave}
              type="button"
              aria-pressed={ancho === clave}
              onClick={() => setAncho(clave)}
              className={clsx(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold',
                ancho === clave
                  ? 'bg-marca/[0.2] text-tinta'
                  : 'text-tinta-suave hover:text-tinta',
              )}
            >
              <Icono className="size-3.5" aria-hidden="true" />
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => marco.current?.contentWindow?.location.reload()}
          className="grid size-9 place-items-center rounded-xl border border-borde text-tinta-suave hover:text-tinta"
          aria-label="Recargar la vista previa"
          title="Recargar"
        >
          <RotateCw className="size-4" aria-hidden="true" />
        </button>
        <a
          href={ruta}
          target="_blank"
          rel="noopener noreferrer"
          className="grid size-9 place-items-center rounded-xl border border-borde text-tinta-suave hover:text-tinta"
          aria-label="Abrir en otra pestaña"
          title="Abrir en otra pestaña"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
      <div className="grid justify-items-center overflow-hidden rounded-[1.25rem] border border-borde bg-black/30 p-2">
        <iframe
          ref={marco}
          src={ruta}
          title={`Vista previa de ${titulo}`}
          className="h-[calc(100dvh-11rem)] min-h-[32rem] rounded-xl bg-fondo transition-[width]"
          style={{ width: elegido.ancho ? `${elegido.ancho}px` : '100%', maxWidth: '100%' }}
        />
      </div>
    </div>
  );
}
