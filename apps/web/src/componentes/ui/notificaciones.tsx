'use client';

import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

type Tono = 'exito' | 'error' | 'info';

interface Notificacion {
  id: number;
  tono: Tono;
  texto: string;
}

type Notificar = (texto: string, tono?: Tono) => void;

const ContextoNotificar = createContext<Notificar>(() => {});

const DURACION_MS = 4500;

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
    (texto, tono = 'exito') => {
      const id = siguiente.current++;
      setLista((l) => [...l.slice(-2), { id, tono, texto }]);
      window.setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar],
  );

  return (
    <ContextoNotificar.Provider value={notificar}>
      {children}
      <div
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
