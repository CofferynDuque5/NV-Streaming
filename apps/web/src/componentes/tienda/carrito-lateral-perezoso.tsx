'use client';

import type { Moneda, ServicioTienda } from '@nv/shared';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { EVENTO_ABRIR_CARRITO } from '@/lib/carrito';

// El carrito lateral se descarga la primera vez que se abre: la portada carga menos JS.
const CarritoLateral = dynamic(() => import('./carrito-lateral').then((m) => m.CarritoLateral), {
  ssr: false,
});

/** Espera la primera apertura del carrito y entonces lo carga ya abierto. */
export function CarritoLateralPerezoso(props: {
  servicios: ServicioTienda[];
  moneda: Moneda;
  cliente: boolean;
}) {
  const [foco, setFoco] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => {
    const abrir = () =>
      setFoco((f) => (f === undefined ? (document.activeElement as HTMLElement | null) : f));
    window.addEventListener(EVENTO_ABRIR_CARRITO, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_CARRITO, abrir);
  }, []);
  if (foco === undefined) return null;
  return <CarritoLateral {...props} abiertoInicial foco={foco} />;
}
