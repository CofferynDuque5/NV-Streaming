'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Comportamiento del panel de alta: Escape lo cierra como el botón ✕, y cuando un
 * envío marca campos con error, lleva el foco y la vista al primero (antes el error
 * quedaba fuera de pantalla y parecía que el botón no hacía nada).
 */
export function CuerpoPanelAlta({
  cerrarHref,
  children,
}: {
  cerrarHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = ref.current?.closest('section') ?? ref.current;
    if (!raiz) return;

    function alPulsar(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const activo = document.activeElement;
      if (activo && activo !== document.body && !raiz!.contains(activo)) return;
      e.preventDefault();
      router.push(cerrarHref, { scroll: false });
    }

    let habiaErrores = false;
    const observador = new MutationObserver(() => {
      const primero = raiz.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (primero && !habiaErrores) {
        primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
        primero.focus({ preventScroll: true });
      }
      habiaErrores = Boolean(primero);
    });
    observador.observe(raiz, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-invalid'],
    });

    document.addEventListener('keydown', alPulsar);
    return () => {
      document.removeEventListener('keydown', alPulsar);
      observador.disconnect();
    };
  }, [cerrarHref, router]);

  return (
    <div ref={ref} className="px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
      {children}
    </div>
  );
}
