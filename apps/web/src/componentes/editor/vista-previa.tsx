'use client';

import { type BloqueSitio, cssPaleta, type PaletaSitio } from '@nv/shared';
import clsx from 'clsx';
import { Layers, Monitor, Smartphone, Tablet } from 'lucide-react';
import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from 'react';
import { BloquesSitio, type ContextoBloques } from '@/componentes/bloques/bloques';
import { INFO_BLOQUES } from './modelo';

export const DISPOSITIVOS = {
  escritorio: { nombre: 'Escritorio', ancho: 1280, icono: Monitor },
  tableta: { nombre: 'Tableta', ancho: 768, icono: Tablet },
  movil: { nombre: 'Móvil', ancho: 375, icono: Smartphone },
} as const;
export type Dispositivo = keyof typeof DISPOSITIVOS;

/**
 * Vista previa con los mismos bloques que el sitio público, al ancho real del
 * dispositivo elegido y reducida para caber en su columna. Un clic en un
 * bloque lo elige para editarlo; los enlaces no navegan.
 */
export function VistaPrevia({
  bloques,
  titulo,
  contexto,
  paleta,
  dispositivo,
  onDispositivo,
  seleccionado,
  conError,
  onElegir,
}: {
  bloques: BloqueSitio[];
  titulo: string;
  contexto: ContextoBloques;
  paleta: PaletaSitio;
  dispositivo: Dispositivo;
  onDispositivo: (d: Dispositivo) => void;
  seleccionado: string | null;
  conError: ReadonlySet<string>;
  onElegir: (id: string) => void;
}) {
  const [disponible, setDisponible] = useState(0);
  const [alto, setAlto] = useState(0);
  const marco = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = marco.current;
    const int = interior.current;
    if (!m || !int) return;
    const observador = new ResizeObserver(() => {
      // 14 px de margen a cada lado del lienzo.
      setDisponible(Math.max(0, m.clientWidth - 28));
      setAlto(int.offsetHeight);
    });
    observador.observe(m);
    observador.observe(int);
    return () => observador.disconnect();
  }, []);

  const { ancho, nombre } = DISPOSITIVOS[dispositivo];
  // Borde del lienzo (más grueso en Móvil, como un teléfono).
  const borde = dispositivo === 'movil' ? 6 : 1;
  const escala = disponible > 0 ? Math.min(1, (disponible - 2 * borde) / ancho) : 1;

  /** Elige el bloque tocado; los enlaces, botones y desplegables de la vista previa no reaccionan. */
  const elegir = (e: MouseEvent) => {
    e.preventDefault();
    const bq = (e.target as HTMLElement).closest<HTMLElement>('[data-bq]');
    if (bq?.dataset.bq) onElegir(bq.dataset.bq);
  };

  return (
    <>
      <header className="ed-col-cab">
        <b className="ed-col-t">Vista previa</b>
        <div className="ed-disp" role="group" aria-label="Tamaño de la vista previa">
          {(Object.keys(DISPOSITIVOS) as Dispositivo[]).map((d) => {
            const { nombre: n, ancho: a, icono: Icono } = DISPOSITIVOS[d];
            return (
              <button
                key={d}
                type="button"
                aria-pressed={dispositivo === d}
                onClick={() => onDispositivo(d)}
              >
                <Icono aria-hidden="true" />
                {n}
                <small aria-hidden="true">{a}</small>
              </button>
            );
          })}
        </div>
      </header>
      <div className="ed-marco" ref={marco}>
        <div
          className={clsx('ed-lienzo', dispositivo === 'movil' && 'movil')}
          style={{
            width: Math.floor(ancho * escala) + 2 * borde,
            height: alto > 0 ? Math.ceil(alto * escala) + 2 * borde : undefined,
          }}
        >
          <style>{cssPaleta(paleta, '[data-vista-sitio]')}</style>
          <div
            ref={interior}
            data-vista-sitio=""
            onClickCapture={elegir}
            className="ed-vista origin-top-left bg-fondo text-tinta"
            style={
              {
                width: ancho,
                transform: `scale(${escala})`,
                '--k': (1 / escala).toFixed(3),
              } as CSSProperties
            }
          >
            {bloques.length === 0 ? (
              <div className="bq-vacia">
                <Layers aria-hidden="true" />
                <b>Página vacía</b>
                <span>Añade bloques y aquí verás cómo queda.</span>
              </div>
            ) : (
              <BloquesSitio
                bloques={bloques}
                titulo={titulo}
                contexto={contexto}
                vistaPrevia
                envolver={(b, contenido) => {
                  const mal = conError.has(b.id);
                  return (
                    <div
                      data-bq={b.id}
                      className={clsx('bq', b.id === seleccionado && 'sel', mal && 'mal')}
                    >
                      <span className="bq-eti" aria-hidden="true">
                        {mal ? 'Revisar · ' : ''}
                        {INFO_BLOQUES[b.tipo].nombre}
                      </span>
                      {contenido}
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>
      <p className="ed-escala">
        {nombre} · {ancho} px{escala < 1 ? ` · al ${Math.round(escala * 100)} %` : ''}
      </p>
    </>
  );
}
