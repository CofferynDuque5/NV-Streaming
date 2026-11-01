'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

type Metodo = 'POST' | 'PATCH' | 'PUT';

/** Tope de espera del refresco: si tarda más, el formulario sigue igual. */
const ESPERA_MAXIMA_REFRESCO_MS = 15_000;

/**
 * Estado común de una acción contra la API: espera, error y refresco de la
 * página de servidor al terminar bien. `ejecutar` no vuelve hasta que la página
 * ya muestra los datos nuevos: así un formulario no se cierra antes de que lo
 * creado aparezca en la lista, y el botón sigue en «cargando» mientras tanto.
 */
export function useAccion() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [refrescando, iniciarRefresco] = useTransition();
  const esperando = useRef<(() => void)[]>([]);

  // Al terminar el refresco (la transición deja de estar pendiente) se liberan las esperas.
  useEffect(() => {
    if (refrescando || esperando.current.length === 0) return;
    const listos = esperando.current;
    esperando.current = [];
    for (const fin of listos) fin();
  }, [refrescando]);

  const ejecutar = useCallback(
    async <T,>(
      metodo: Metodo,
      ruta: string,
      cuerpo?: unknown,
      cabeceras?: Record<string, string>,
    ): Promise<{ datos: T } | null> => {
      setCargando(true);
      setError(null);
      const r = await llamarApi<T>(metodo, ruta, cuerpo ?? {}, cabeceras);
      if (!r.ok) {
        setCargando(false);
        setError(r.error);
        return null;
      }
      await new Promise<void>((fin) => {
        const tope = setTimeout(fin, ESPERA_MAXIMA_REFRESCO_MS);
        esperando.current.push(() => {
          clearTimeout(tope);
          fin();
        });
        iniciarRefresco(() => router.refresh());
      });
      setCargando(false);
      return { datos: r.datos };
    },
    [router],
  );

  const campos = erroresPorCampo(error);
  return { cargando, error, campos, ejecutar, limpiar: () => setError(null) };
}

/** Mensaje general de error (los errores por campo se muestran bajo cada campo). */
export function ErrorGeneral({ error }: { error: ErrorLlamada | null }) {
  if (!error || error.campos) return null;
  return <Alerta tono="peligro">{error.mensaje}</Alerta>;
}

/** Panel desplegable con título y botón de cerrar, para formularios de alta y edición. */
export function PanelFormulario({
  titulo,
  descripcion,
  onCerrar,
  children,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'relative w-full rounded-nv border border-marca/25 bg-elevada p-5 shadow-nv sm:p-6',
        'before:pointer-events-none before:absolute before:inset-x-6 before:-top-px before:h-px before:bg-linear-to-r before:from-transparent before:via-marca/60 before:to-transparent',
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h3 className="text-base font-semibold">{titulo}</h3>
          {descripcion && <p className="text-sm text-tinta-suave">{descripcion}</p>}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="-mt-1 -mr-1 rounded-lg p-1.5 text-tinta-tenue hover:bg-hundida hover:text-tinta"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

/** Texto de un campo de formulario, recortado; `undefined` si está vacío. */
export function textoDe(d: FormData, nombre: string): string | undefined {
  const v = d.get(nombre);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Fecha de hoy en formato de `<input type="date">` (hora local del navegador). */
export function hoyLocal(): string {
  const d = new Date();
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}
