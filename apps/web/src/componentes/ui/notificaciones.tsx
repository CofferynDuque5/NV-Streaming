'use client';

import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

type Tono = 'exito' | 'error' | 'info';

/** Acción opcional del aviso (p. ej. «Deshacer» o «Ver carrito»). */
export interface AccionAviso {
  texto: string;
  alPulsar: () => void;
}

interface Notificacion {
  id: number;
  tono: Tono;
  texto: string;
  accion?: AccionAviso | undefined;
}

type Notificar = (texto: string, tono?: Tono, accion?: AccionAviso) => void;

const ContextoNotificar = createContext<Notificar>(() => {});

const DURACION_MS = 4500;
/** Con una acción, el aviso dura más para dar tiempo a pulsarla. */
const DURACION_ACCION_MS = 7000;

const estilos: Record<Tono, { clase: string; icono: ReactNode }> = {
  exito: {
    clase: 'border-exito/50',
    icono: <CircleCheck className="size-5 text-exito" aria-hidden="true" />,
  },
  error: {
    clase: 'border-peligro/55',
    icono: <CircleAlert className="size-5 text-peligro" aria-hidden="true" />,
  },
  info: {
    clase: 'border-borde-fuerte',
    icono: <Info className="size-5 text-cian" aria-hidden="true" />,
  },
};

/**
 * Avisos flotantes de estado: verde al terminar bien y rojo si algo falla.
 * Se anuncian a los lectores de pantalla y se cierran solos.
 */
export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const siguiente = useRef(1);

  const cerrar = useCallback((id: number) => {
    setLista((l) => l.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback<Notificar>(
    (texto, tono = 'exito', accion) => {
      const id = siguiente.current++;
      setLista((l) => [...l.slice(-2), { id, tono, texto, accion }]);
      window.setTimeout(() => cerrar(id), accion ? DURACION_ACCION_MS : DURACION_MS);
    },
    [cerrar],
  );

  return (
    <ContextoNotificar.Provider value={notificar}>
      {children}
      <div
        data-avisos
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nv-barra-inferior,0px)+1rem+env(safe-area-inset-bottom,0px))] z-[80] grid justify-items-center gap-2 px-4"
      >
        {lista.map((n) => (
          <div
            key={n.id}
            role={n.tono === 'error' ? 'alert' : 'status'}
            className={clsx(
              'vidrio aparecer pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-nv',
              estilos[n.tono].clase,
            )}
          >
            {estilos[n.tono].icono}
            <span className="min-w-0 flex-1">{n.texto}</span>
            {n.accion && (
              <button
                type="button"
                onClick={() => {
                  n.accion?.alPulsar();
                  cerrar(n.id);
                }}
                className="shrink-0 border-l border-borde-fuerte pl-3 font-semibold whitespace-nowrap text-cian hover:underline"
              >
                {n.accion.texto}
              </button>
            )}
            <button
              type="button"
              onClick={() => cerrar(n.id)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-tinta-tenue hover:text-tinta"
              aria-label="Cerrar aviso"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ContextoNotificar.Provider>
  );
}

/** Muestra un aviso flotante: `notificar('Plan agregado')` o `notificar('No se pudo', 'error')`. */
export function useNotificar(): Notificar {
  return useContext(ContextoNotificar);
}
