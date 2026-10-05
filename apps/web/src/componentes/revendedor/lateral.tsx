'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Panel lateral (ficha del cliente y nueva venta). Es un `<dialog>` modal: el
 * navegador encierra el foco, cierra con Escape y lo devuelve al botón que lo
 * abrió. En el teléfono ocupa toda la pantalla.
 */
export function Lateral({
  abierto,
  titulo,
  subtitulo,
  pie,
  onCerrar,
  children,
}: {
  abierto: boolean;
  titulo: string;
  subtitulo?: ReactNode;
  pie?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
    // Sin desplazar la página de atrás mientras está abierto.
    document.documentElement.style.overflow = abierto ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[27.5rem] border-0 border-l border-borde-fuerte bg-transparent p-0 text-tinta backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-[nv-entrar_.25s_ease]"
    >
      {abierto && (
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-[linear-gradient(180deg,#0b1030,#060818)]">
          <header className="flex items-start justify-between gap-3 border-b border-borde px-4 py-3.5">
            <div className="grid min-w-0 gap-0.5">
              <h2 id={id} className="truncate font-titulo text-lg font-bold">
                {titulo}
              </h2>
              {subtitulo && <span className="text-[0.8rem] text-tinta-suave">{subtitulo}</span>}
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-borde hover:border-borde-fuerte"
              aria-label="Cerrar"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>
          <div className="grid content-start gap-4.5 overflow-y-auto px-4 py-4">{children}</div>
          {pie && <div className="border-t border-borde px-4 py-3.5">{pie}</div>}
        </div>
      )}
    </dialog>
  );
}
