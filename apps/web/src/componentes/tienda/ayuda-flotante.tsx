'use client';

import { enlaceWhatsapp } from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowRight,
  CircleHelp,
  LifeBuoy,
  type LucideIcon,
  Mail,
  MessageCircle,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

/**
 * Botón flotante de ayuda. Lleva a los canales que existen de verdad:
 * WhatsApp y correo si el equipo los configuró, y siempre al soporte del panel.
 */
export function AyudaFlotante({
  whatsapp,
  correo,
  preguntas,
}: {
  whatsapp: string | null;
  correo: string | null;
  /** Enlace a las preguntas frecuentes de la portada, si las tiene. */
  preguntas: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: PointerEvent) {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  interface Opcion {
    href: string;
    externo: boolean;
    titulo: string;
    texto: string;
    color: string;
    Icono: LucideIcon;
  }
  const opciones = [
    whatsapp && {
      href: enlaceWhatsapp(whatsapp, 'Hola, necesito ayuda con NV Streaming.'),
      externo: true,
      titulo: 'Escríbenos por WhatsApp',
      texto: 'Con tu número de pedido a la mano',
      color: '#22c55e',
      Icono: MessageCircle,
    },
    {
      href: '/cuenta/soporte/nueva',
      externo: false,
      titulo: 'Abrir un ticket',
      texto: 'Te respondemos en tu panel',
      color: '#5b98ff',
      Icono: LifeBuoy,
    },
    preguntas && {
      href: preguntas,
      externo: false,
      titulo: 'Preguntas frecuentes',
      texto: 'Pagos, activación y más',
      color: '#22d3ee',
      Icono: CircleHelp,
    },
    correo && {
      href: `mailto:${correo}`,
      externo: true,
      titulo: 'Escríbenos un correo',
      texto: correo,
      color: '#a78bfa',
      Icono: Mail,
    },
  ].filter((o): o is Opcion => Boolean(o));

  return (
    <div
      ref={caja}
      className="fixed right-4 bottom-[calc(var(--nv-barra-inferior,0px)+1rem+env(safe-area-inset-bottom,0px))] z-40 grid justify-items-end gap-3"
    >
      <section
        id={id}
        aria-label="Ayuda"
        hidden={!abierto}
        className="flotante aparecer w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-3xl shadow-nv"
      >
        <header className="bg-[linear-gradient(95deg,#1d4ed8,#6d28d9_60%,#be185d)] px-5 py-4">
          <b className="font-titulo text-lg">Soporte NV</b>
          <p className="text-sm text-white/85">¿En qué te ayudamos?</p>
        </header>
        <ul className="grid gap-1 p-2">
          {opciones.map((o) => {
            const contenido = (
              <>
                <span
                  className="orbe orbe-sm"
                  style={{ '--c': o.color } as CSSProperties}
                  aria-hidden="true"
                >
                  <o.Icono />
                </span>
                <span className="grid min-w-0 flex-1">
                  <b className="text-sm">{o.titulo}</b>
                  <span className="truncate text-xs text-tinta-tenue">{o.texto}</span>
                </span>
                <ArrowRight className="size-4 text-tinta-tenue" aria-hidden="true" />
              </>
            );
            const clase = 'flex items-center gap-3 rounded-2xl p-2.5 hover:bg-white/[0.05]';
            return (
              <li key={o.titulo}>
                {o.externo ? (
                  <a
                    href={o.href}
                    target={o.href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={clase}
                  >
                    {contenido}
                  </a>
                ) : (
                  <Link href={o.href} className={clase} onClick={() => setAbierto(false)}>
                    {contenido}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={abierto ? 'Cerrar ayuda' : 'Abrir ayuda'}
        onClick={() => setAbierto((a) => !a)}
        className={clsx(
          'grid size-14 place-items-center rounded-full text-white shadow-[0_0_0_6px_rgb(91_152_255/0.12),0_12px_30px_-8px_rgb(139_92_246/0.9)] transition-transform hover:scale-105',
          'bg-[linear-gradient(135deg,#22d3ee,#3b82f6_40%,#8b5cf6_75%,#e879f9)]',
        )}
      >
        {abierto ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <MessageCircle className="size-6" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
