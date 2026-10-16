'use client';

import { type AnclaPolitica, enlacePoliticas } from '@nv/shared';
import clsx from 'clsx';
import { Check, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNotificar } from '@/componentes/ui/notificaciones';

/** Copia en un textarea oculto cuando el portapapeles moderno no está disponible. */
function copiarViejo(texto: string): boolean {
  try {
    const a = document.createElement('textarea');
    a.value = texto;
    a.setAttribute('readonly', '');
    a.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(a);
    a.select();
    const ok = document.execCommand('copy');
    a.remove();
    return ok;
  } catch {
    return false;
  }
}

/** «Copiar enlace» de una sección: copia la dirección completa con su ancla y lo confirma. */
export function BotonCopiarEnlace({ ancla, titulo }: { ancla: AnclaPolitica; titulo: string }) {
  const notificar = useNotificar();
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  async function copiar() {
    const url = `${window.location.origin}${enlacePoliticas(ancla)}`;
    try {
      history.replaceState(history.state, '', `#${ancla}`);
    } catch {
      // Sin historial (vista incrustada): el enlace se copia igual.
    }
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = copiarViejo(url);
    if (!ok) {
      notificar(`No se pudo copiar. El enlace es ${url}`, 'error');
      return;
    }
    setCopiado(true);
    notificar(`Enlace copiado: ${url}`);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setCopiado(false), 2400);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? `Enlace a ${titulo} copiado` : `Copiar enlace a ${titulo}`}
      className={clsx(
        'inline-flex h-9 items-center gap-[7px] rounded-[11px] border px-3 text-[0.8rem] font-medium whitespace-nowrap transition-colors max-[559px]:order-3',
        copiado
          ? 'border-exito/60 bg-exito/[0.08] text-exito'
          : 'border-borde-fuerte bg-white/[0.03] text-tinta-suave hover:border-cian hover:text-tinta',
      )}
    >
      {copiado ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Link2 className="size-4" aria-hidden="true" />
      )}
      <span>{copiado ? 'Enlace copiado' : 'Copiar enlace'}</span>
    </button>
  );
}
