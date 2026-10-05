'use client';

import clsx from 'clsx';
import { ArrowUp, ChevronDown } from 'lucide-react';
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface EntradaIndice {
  id: string;
  /** Nombre corto en el índice. */
  texto: string;
  /** «01»…«07»; vacío para «Lo esencial». */
  numero: string;
}

/** A partir de aquí el índice es una columna fija a la izquierda (como en el diseño). */
const ESCRITORIO = '(min-width: 1024px)';

function Enlaces({ indice, activa }: { indice: EntradaIndice[]; activa: string }) {
  return indice.map((e) => (
    <li key={e.id}>
      <a
        href={`#${e.id}`}
        data-ir={e.id}
        aria-current={e.id === activa ? 'location' : undefined}
        className={clsx(
          'flex items-center gap-3 rounded-[11px] px-3 py-[11px] text-[0.9rem] lg:py-[9px] lg:text-sm',
          e.id === activa
            ? 'bg-cian/[0.09] text-tinta shadow-[inset_3px_0_0_var(--nv-cian)]'
            : 'text-tinta-suave hover:bg-white/[0.04] hover:text-tinta',
        )}
      >
        <i
          className={clsx(
            'w-5 shrink-0 font-mono text-[0.7rem] font-bold not-italic tabular-nums',
            e.id === activa ? 'text-cian' : 'text-tinta-tenue',
          )}
        >
          {e.numero}
        </i>
        <span className="truncate">{e.texto}</span>
      </a>
    </li>
  ));
}

/**
 * Marco de /politicas: índice fijo (columna en el PC, selector «En esta página»
 * bajo la cabecera en el teléfono) que marca la sección a la vista, saltos con
 * foco en el título y «Volver arriba». Los enlaces a /politicas#… del texto
 * también saltan aquí sin recargar.
 */
export function MarcoPoliticas({
  indice,
  cabecera,
  children,
}: {
  indice: EntradaIndice[];
  cabecera: ReactNode;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLElement>(null);
  const [activa, setActiva] = useState(indice[0]?.id ?? '');
  const [abierto, setAbierto] = useState(false);
  const [verArriba, setVerArriba] = useState(false);

  /** Alto de la cabecera fija de la tienda y del selector del teléfono, para los desplazamientos. */
  const medir = useCallback(() => {
    const r = raiz.current;
    if (!r) return;
    const cab = document.querySelector<HTMLElement>('[data-cabecera-tienda]');
    r.style.setProperty('--pl-cab', `${cab?.offsetHeight ?? 0}px`);
    r.style.setProperty('--pl-barra', `${barra.current?.offsetHeight ?? 0}px`);
  }, []);

  const calcularActiva = useCallback(() => {
    const secciones = indice
      .map((e) => document.getElementById(e.id))
      .filter((s): s is HTMLElement => s !== null);
    if (secciones.length === 0) return;
    const cab = document.querySelector<HTMLElement>('[data-cabecera-tienda]')?.offsetHeight ?? 0;
    const movil = !window.matchMedia(ESCRITORIO).matches;
    const alto = movil ? (barra.current?.offsetHeight ?? 0) : 0;
    const linea = Math.max(cab + alto + 24, window.innerHeight * 0.35);
    let actual = secciones[0]!.id;
    for (const s of secciones) if (s.getBoundingClientRect().top <= linea) actual = s.id;
    const fin = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (fin) actual = secciones[secciones.length - 1]!.id;
    setActiva(actual);
    setVerArriba(window.scrollY > window.innerHeight * 0.9);
  }, [indice]);

  const ir = useCallback(
    (id: string, suave = true) => {
      const s = document.getElementById(id);
      if (!s) return;
      setAbierto(false);
      medir();
      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      s.scrollIntoView({ block: 'start', behavior: suave && !reducido ? 'smooth' : 'instant' });
      try {
        history.replaceState(history.state, '', `#${id}`);
      } catch {
        // Sin historial: el salto funciona igual.
      }
      s.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      // Destello del título para ubicarse (se reinicia si se vuelve a pulsar).
      s.removeAttribute('data-marcada');
      void s.offsetWidth;
      s.setAttribute('data-marcada', '');
      setActiva(id);
    },
    [medir],
  );

  const arriba = useCallback(() => {
    setAbierto(false);
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducido ? 'instant' : 'smooth' });
    try {
      history.replaceState(history.state, '', window.location.pathname + window.location.search);
    } catch {
      // Sin historial.
    }
    raiz.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let pendiente = false;
    const agenda = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        calcularActiva();
      });
    };
    const alCambiarTamano = () => {
      medir();
      agenda();
    };
    medir();
    agenda();
    const cab = document.querySelector('[data-cabecera-tienda]');
    const observador = new ResizeObserver(alCambiarTamano);
    if (cab) observador.observe(cab);
    if (barra.current) observador.observe(barra.current);
    window.addEventListener('scroll', agenda, { passive: true });
    window.addEventListener('resize', alCambiarTamano);
    // Llegada con ancla (p. ej. desde /terminos): el título queda bajo la cabecera, con foco.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (indice.some((e) => e.id === hash)) requestAnimationFrame(() => ir(hash, false));
    return () => {
      observador.disconnect();
      window.removeEventListener('scroll', agenda);
      window.removeEventListener('resize', alCambiarTamano);
    };
  }, [calcularActiva, indice, ir, medir]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!barra.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  /** Índice, enlaces del texto a /politicas#… y «Volver arriba»: saltan sin recargar. */
  function alPulsar(e: MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const objetivo = e.target as HTMLElement;
    if (objetivo.closest('[data-arriba]')) {
      e.preventDefault();
      arriba();
      return;
    }
    const enlace = objetivo.closest<HTMLAnchorElement>('a[href]');
    if (!enlace) return;
    const url = new URL(enlace.href, window.location.href);
    const id = decodeURIComponent(url.hash.slice(1));
    if (url.pathname !== window.location.pathname || !indice.some((x) => x.id === id)) return;
    e.preventDefault();
    ir(id);
  }

  const nombreActiva = indice.find((e) => e.id === activa)?.texto ?? '';

  return (
    <div ref={raiz} onClick={alPulsar} className="contenedor relative pt-1.5 pb-12">
      {cabecera}
      <nav
        ref={barra}
        aria-label="En esta página"
        className="sticky top-[var(--pl-cab,0px)] z-30 -mx-4 mb-1.5 border-y border-borde bg-fondo/90 px-4 py-2 backdrop-blur-[14px] sm:-mx-6 sm:px-6 lg:hidden"
      >
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls="pl-lista-movil"
          onClick={() => setAbierto((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-[14px] border border-borde-fuerte bg-superficie/80 px-3.5 py-2 text-left"
        >
          <span className="shrink-0 font-titulo text-[0.7rem] font-bold tracking-[0.16em] text-cian uppercase">
            En esta página
          </span>
          <b className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold">{nombreActiva}</b>
          <ChevronDown
            className={clsx('size-4 text-cian transition-transform', abierto && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        <ol
          id="pl-lista-movil"
          hidden={!abierto}
          className="flotante mt-2 mb-0.5 grid max-h-[calc(100dvh-var(--pl-cab,0px)-10rem)] gap-0.5 overflow-auto rounded-2xl p-1.5"
        >
          <Enlaces indice={indice} activa={activa} />
        </ol>
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden self-start lg:sticky lg:top-[calc(var(--pl-cab,0px)+20px)] lg:block">
          <nav
            aria-label="Índice"
            className="grid gap-1 rounded-[20px] border border-borde bg-hundida/55 px-2.5 pt-4 pb-3"
          >
            <span className="px-3 pb-1.5 font-titulo text-[0.7rem] font-bold tracking-[0.16em] text-cian uppercase">
              En esta página
            </span>
            <ol className="grid gap-0.5">
              <Enlaces indice={indice} activa={activa} />
            </ol>
            <a
              href="#"
              data-arriba
              className="mt-2 flex items-center gap-2 border-t border-borde px-3 pt-2.5 pb-1 text-[0.85rem] text-tinta-suave hover:text-cian"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
              Volver arriba
            </a>
          </nav>
        </aside>
        <div className="grid max-w-[72ch] min-w-0">{children}</div>
      </div>
      <button
        type="button"
        data-arriba
        hidden={!verArriba}
        aria-label="Volver arriba"
        className="fixed bottom-[calc(var(--nv-barra-inferior,0px)+1rem+env(safe-area-inset-bottom,0px))] left-4 z-40 inline-flex h-11 items-center gap-[7px] rounded-full border border-borde-fuerte bg-hundida/90 px-[15px] text-[0.85rem] font-medium whitespace-nowrap shadow-[0_14px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-md lg:hidden"
      >
        <ArrowUp className="size-4 text-cian" aria-hidden="true" />
        <span>Volver arriba</span>
      </button>
    </div>
  );
}
