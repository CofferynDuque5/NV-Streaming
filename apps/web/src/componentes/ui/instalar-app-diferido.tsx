'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const InstalarApp = dynamic(() => import('./instalar-app').then((m) => m.InstalarApp), {
  ssr: false,
});

/**
 * El aviso para instalar la app se carga aparte y solo cuando la página ya
 * terminó de cargar: no suma código ni trabajo a la primera pintura.
 */
export function InstalarAppDiferido() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const ahora = () => setListo(true);
    const tras = () =>
      'requestIdleCallback' in window ? window.requestIdleCallback(ahora) : setTimeout(ahora, 1);
    if (document.readyState === 'complete') {
      tras();
      return;
    }
    window.addEventListener('load', tras, { once: true });
    return () => window.removeEventListener('load', tras);
  }, []);
  return listo ? <InstalarApp /> : null;
}
