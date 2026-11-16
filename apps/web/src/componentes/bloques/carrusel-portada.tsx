'use client';

import clsx from 'clsx';
import { Pause, Play } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * Carrusel de la portada: muestra una diapositiva a la vez y pasa a la
 * siguiente cada pocos segundos. Se detiene al pasar el ratón o al enfocar
 * un enlace, con el botón de pausa y si la persona prefiere menos movimiento.
 * Todas las diapositivas ocupan la misma celda, así la altura no salta.
 */
export function CarruselPortada({
  diapositivas,
  nombres,
  segundos,
}: {
  diapositivas: ReactNode[];
  /** Título de cada diapositiva, para los puntos. */
  nombres: string[];
  segundos: number;
}) {
  const [actual, setActual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [encima, setEncima] = useState(false);
  const [quieto, setQuieto] = useState(false);
  // La primera diapositiva aparece sin animación (es lo primero que se pinta).
  const [cambio, setCambio] = useState(false);
  const ir = (i: number) => {
    setCambio(true);
    setActual(i);
  };
  const total = diapositivas.length;

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cambiar = () => setQuieto(consulta.matches);
    cambiar();
    consulta.addEventListener('change', cambiar);
    return () => consulta.removeEventListener('change', cambiar);
  }, []);

  const corre = !pausado && !encima && !quieto && total > 1;
  useEffect(() => {
    if (!corre) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setCambio(true);
      setActual((i) => (i + 1) % total);
    }, segundos * 1000);
    return () => window.clearInterval(t);
  }, [corre, segundos, total]);

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label="Destacados"
      className="relative"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
      }}
    >
      <div className="grid">
        {diapositivas.map((d, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${total}`}
            aria-hidden={i !== actual}
            inert={i !== actual}
            className={clsx(
              '[grid-area:1/1] transition-opacity duration-700',
              i === actual
                ? clsx('opacity-100', cambio && 'nv-diapositiva-activa')
                : 'pointer-events-none opacity-0',
            )}
          >
            {d}
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="absolute inset-x-0 -bottom-12 flex items-center justify-center gap-2 @3xl:-bottom-14">
          {nombres.map((n, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ver «${n}»`}
              aria-current={i === actual || undefined}
              onClick={() => ir(i)}
              className={clsx(
                'h-2 rounded-full transition-all',
                i === actual
                  ? 'w-7 bg-[linear-gradient(90deg,#22d3ee,#8b5cf6,#e879f9)]'
                  : 'w-2 bg-white/25 hover:bg-white/50',
              )}
            />
          ))}
          <button
            type="button"
            onClick={() => setPausado((v) => !v)}
            aria-label={pausado ? 'Reanudar el carrusel' : 'Pausar el carrusel'}
            className="ml-1 grid size-7 place-items-center rounded-full text-tinta-tenue hover:bg-white/10 hover:text-tinta"
          >
            {pausado ? (
              <Play className="size-3.5" aria-hidden="true" />
            ) : (
              <Pause className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
