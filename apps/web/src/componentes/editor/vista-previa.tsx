'use client';

import { type BloqueSitio, cssPaleta, type PaletaSitio } from '@nv/shared';
import clsx from 'clsx';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { BloquesSitio, type ContextoBloques } from '@/componentes/bloques/bloques';

const DISPOSITIVOS = {
  escritorio: { nombre: 'Escritorio', ancho: 1280, icono: Monitor },
  tableta: { nombre: 'Tableta', ancho: 768, icono: Tablet },
  movil: { nombre: 'Móvil', ancho: 375, icono: Smartphone },
} as const;
type Dispositivo = keyof typeof DISPOSITIVOS;

/**
 * Vista previa con los mismos bloques que el sitio público. Se pinta al ancho
 * real del dispositivo elegido y se reduce para caber en el panel; los bloques
 * usan consultas de contenedor, así que se ven como en ese dispositivo.
 */
export function VistaPrevia({
  bloques,
  titulo,
  contexto,
  paleta,
}: {
  bloques: BloqueSitio[];
  titulo: string;
  contexto: ContextoBloques;
  paleta: PaletaSitio;
}) {
  const [dispositivo, setDispositivo] = useState<Dispositivo>('escritorio');
  const [disponible, setDisponible] = useState(0);
  const [alto, setAlto] = useState(0);
  const exterior = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ext = exterior.current;
    const int = interior.current;
    if (!ext || !int) return;
    const observador = new ResizeObserver(() => {
      setDisponible(ext.clientWidth);
      setAlto(int.offsetHeight);
    });
    observador.observe(ext);
    observador.observe(int);
    return () => observador.disconnect();
  }, []);

  const ancho = DISPOSITIVOS[dispositivo].ancho;
  const escala = disponible > 0 ? Math.min(1, disponible / ancho) : 1;

  /** En la vista previa los enlaces no navegan. */
  const sinNavegar = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  };

  return (
    <section aria-label="Vista previa" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Vista previa</h2>
        <div
          role="group"
          aria-label="Ancho de la vista previa"
          className="flex gap-1 rounded-xl border border-borde bg-hundida p-1"
        >
          {(Object.keys(DISPOSITIVOS) as Dispositivo[]).map((d) => {
            const { nombre, icono: Icono } = DISPOSITIVOS[d];
            return (
              <button
                key={d}
                type="button"
                aria-pressed={dispositivo === d}
                onClick={() => setDispositivo(d)}
                className={clsx(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
                  dispositivo === d
                    ? 'bg-superficie text-tinta shadow-nv'
                    : 'text-tinta-suave hover:text-tinta',
                )}
              >
                <Icono className="size-3.5" aria-hidden="true" />
                {nombre}
              </button>
            );
          })}
        </div>
      </div>
      <div
        ref={exterior}
        className="relative w-full overflow-hidden rounded-nv border border-borde-fuerte"
        style={{ height: alto > 0 ? Math.ceil(alto * escala) : undefined }}
      >
        <style>{cssPaleta(paleta, '[data-vista-sitio]')}</style>
        <div
          ref={interior}
          data-vista-sitio=""
          onClickCapture={sinNavegar}
          className="origin-top-left bg-fondo text-tinta"
          style={{ width: ancho, transform: `scale(${escala})` }}
        >
          {bloques.length === 0 ? (
            <p className="px-6 py-24 text-center text-tinta-tenue">
              La página no tiene bloques. Añade el primero.
            </p>
          ) : (
            <BloquesSitio bloques={bloques} titulo={titulo} contexto={contexto} vistaPrevia />
          )}
        </div>
      </div>
    </section>
  );
}
