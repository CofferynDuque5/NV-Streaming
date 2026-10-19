'use client';

import type { Moneda } from '@nv/shared';
import { Check, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Boton, clasesBoton } from '@/componentes/ui/boton';
import { MAX_CARRITO, RUTA_CARRITO, useCarrito, useCarritoListo } from '@/lib/carrito';

/** Botón para sumar un plan al carrito (o quitarlo si ya está). */
export function AgregarAlCarrito({
  planId,
  variante = 'secundario',
}: {
  planId: string;
  variante?: 'primario' | 'secundario';
}) {
  const carrito = useCarrito();
  if (carrito.tiene(planId)) {
    return (
      <Boton
        variante="fantasma"
        className="w-full"
        icono={<Check className="size-4 text-exito" />}
        onClick={() => carrito.quitar(planId)}
        aria-label="En el carrito. Pulsa para quitarlo."
      >
        En el carrito
      </Boton>
    );
  }
  return (
    <Boton
      variante={variante}
      className="w-full"
      icono={<ShoppingCart className="size-4" />}
      disabled={carrito.lleno}
      title={carrito.lleno ? `Caben hasta ${MAX_CARRITO} planes por pedido.` : undefined}
      onClick={() => carrito.agregar(planId)}
    >
      Agregar al carrito
    </Boton>
  );
}

/** Enlace al carrito con la cantidad de planes elegidos. */
export function EnlaceCarrito({ moneda, destino }: { moneda: Moneda; destino?: string }) {
  const { planes } = useCarrito();
  const href = destino ?? `${RUTA_CARRITO}?moneda=${moneda}`;
  return (
    <Link
      href={href}
      className={clasesBoton(planes.length > 0 ? 'primario' : 'secundario', 'md')}
      aria-label={`Ver el carrito (${planes.length} ${planes.length === 1 ? 'plan' : 'planes'})`}
    >
      <ShoppingCart className="size-4" aria-hidden="true" />
      Carrito
      <span className="rounded-full bg-black/15 px-2 text-xs tabular-nums">{planes.length}</span>
    </Link>
  );
}

/**
 * Tarjeta del panel con el carrito guardado en este navegador: cuántos planes
 * tiene y el enlace a la página del carrito, donde se cotiza y se paga.
 */
export function ResumenCarritoCuenta({ moneda }: { moneda: Moneda }) {
  const listo = useCarritoListo();
  const { planes } = useCarrito();
  const n = planes.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
      <p className="text-sm text-tinta-suave" aria-live="polite">
        {!listo
          ? 'Revisando tu carrito…'
          : n === 0
            ? `Tu carrito está vacío. Agrega hasta ${MAX_CARRITO} planes y págalos juntos.`
            : `Tienes ${n} ${n === 1 ? 'plan' : 'planes'} en tu carrito, de ${MAX_CARRITO}.`}
      </p>
      <Link
        href={n === 0 ? `/catalogo?moneda=${moneda}` : `${RUTA_CARRITO}?moneda=${moneda}`}
        className={clasesBoton(n === 0 ? 'secundario' : 'primario')}
      >
        {n === 0 ? 'Ver catálogo' : 'Ir al carrito'}
      </Link>
    </div>
  );
}
