'use client';

import clsx from 'clsx';
import { Check, ShoppingCart } from 'lucide-react';
import { clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { MAX_CARRITO, useCarrito } from '@/lib/carrito';

/**
 * Suma un plan al carrito (solo su id; el precio se cotiza en la API al pagar)
 * y avisa con un mensaje verde, o rojo si el carrito ya está lleno.
 */
export function BotonCarrito({
  planId,
  nombre,
  variante = 'icono',
  tamano = 'lg',
  className,
}: {
  planId: string;
  /** Nombre del servicio y plan, para el aviso y la etiqueta accesible. */
  nombre: string;
  /** «principal»: el botón primario de la ficha del servicio. */
  variante?: 'icono' | 'completo' | 'principal';
  tamano?: 'md' | 'lg';
  className?: string;
}) {
  const carrito = useCarrito();
  const notificar = useNotificar();
  const dentro = carrito.tiene(planId);

  function pulsar() {
    if (dentro) {
      carrito.quitar(planId);
      notificar(`Quitaste ${nombre} del carrito.`, 'info');
      return;
    }
    if (carrito.lleno) {
      notificar(`Tu carrito ya tiene ${MAX_CARRITO} planes, el máximo por pedido.`, 'error');
      return;
    }
    carrito.agregar(planId);
    notificar(`${nombre} está en tu carrito.`, 'exito');
  }

  if (variante === 'principal') {
    return (
      <button
        type="button"
        onClick={pulsar}
        aria-pressed={dentro}
        className={clasesBoton(
          dentro ? 'secundario' : 'primario',
          tamano,
          clsx(dentro && 'border-exito/50 bg-exito-suave', className),
        )}
      >
        {dentro ? (
          <Check className="size-4 text-exito" aria-hidden="true" />
        ) : (
          <ShoppingCart className="size-4" aria-hidden="true" />
        )}
        {dentro ? 'En el carrito' : 'Agregar al carrito'}
      </button>
    );
  }
  if (variante === 'completo') {
    return (
      <button
        type="button"
        onClick={pulsar}
        aria-pressed={dentro}
        className={clsx(
          'inline-flex h-11 items-center justify-center gap-2 rounded-[0.875rem] border px-4 text-sm font-semibold transition-colors',
          dentro
            ? 'border-exito/50 bg-exito-suave text-tinta'
            : 'border-borde-fuerte bg-marca-suave text-tinta hover:border-cian',
          className,
        )}
      >
        {dentro ? (
          <Check className="size-4 text-exito" aria-hidden="true" />
        ) : (
          <ShoppingCart className="size-4" aria-hidden="true" />
        )}
        {dentro ? 'En el carrito' : 'Agregar'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={pulsar}
      aria-pressed={dentro}
      aria-label={dentro ? `Quitar ${nombre} del carrito` : `Agregar ${nombre} al carrito`}
      title={dentro ? 'En el carrito' : 'Agregar al carrito'}
      className={clsx(
        'grid size-11 shrink-0 place-items-center rounded-[0.875rem] border transition-colors',
        dentro
          ? 'border-exito/50 bg-exito-suave text-exito'
          : 'border-borde-fuerte bg-white/[0.03] text-tinta hover:border-cian',
        className,
      )}
    >
      {dentro ? (
        <Check className="size-[1.1rem]" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-[1.1rem]" aria-hidden="true" />
      )}
    </button>
  );
}
