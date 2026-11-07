'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Espera tras la última tecla antes de buscar. */
const ESPERA_BUSQUEDA_MS = 450;

/**
 * Se pone dentro de un formulario de filtros (GET): al cambiar una lista, una casilla o
 * una fecha aplica el filtro al momento, y al escribir en la búsqueda, tras una pausa.
 * Antes había que pulsar «Filtrar» y era fácil creer que no había resultados. El botón
 * se queda para quien navega sin JavaScript o prefiere pulsarlo.
 */
export function EnvioAutomatico() {
  const ref = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  const ruta = usePathname();

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    let espera: ReturnType<typeof setTimeout> | undefined;

    const aplicar = () => {
      clearTimeout(espera);
      const datos = new URLSearchParams();
      for (const [clave, valor] of new FormData(form)) {
        if (typeof valor === 'string' && valor.trim() !== '') datos.append(clave, valor);
      }
      const consulta = datos.toString();
      router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
    };
    const alCambiar = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.type === 'search' || el.type === 'text') return; // la búsqueda va por «input»
      aplicar();
    };
    const alEscribir = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.type !== 'search' && el.type !== 'text') return;
      clearTimeout(espera);
      espera = setTimeout(aplicar, ESPERA_BUSQUEDA_MS);
    };
    form.addEventListener('change', alCambiar);
    form.addEventListener('input', alEscribir);
    return () => {
      clearTimeout(espera);
      form.removeEventListener('change', alCambiar);
      form.removeEventListener('input', alEscribir);
    };
  }, [router, ruta]);

  return <span ref={ref} hidden />;
}
