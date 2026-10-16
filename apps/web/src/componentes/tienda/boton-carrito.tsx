'use client';

import clsx from 'clsx';
import { Check, ShoppingCart } from 'lucide-react';
import { clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { abrirCarrito, MAX_CARRITO, useCarrito } from '@/lib/carrito';

const VER_CARRITO = { texto: 'Ver carrito', alPulsar: abrirCarrito };

/**
 * Agrega un plan al carrito (solo su id; el precio se cotiza en la API) y lo
 * avisa con «Ver carrito». Un plan que ya está no se repite, y con el carrito
 * lleno se avisa en rojo.
 */
export function useAgregarAlCarrito() {
  const carrito = useCarrito();
  const notificar = useNotificar();
  return (planId: string, nombre: string): boolean => {
    if (carrito.tiene(planId)) {
      notificar('Ese plan ya está en tu carrito.', 'error', VER_CARRITO);
      return false;
    }
    if (carrito.lleno) {
      notificar(
        `Tu carrito ya tiene ${MAX_CARRITO} planes. Quita uno para agregar otro.`,
        'error',
        VER_CARRITO,
      );
      return false;
    }
    carrito.agregar(planId);
    notificar(
      carrito.planes.length + 1 >= MAX_CARRITO
        ? `${nombre} está en tu carrito. Llegaste al máximo de ${MAX_CARRITO} planes.`
        : `${nombre} está en tu carrito.`,
      'exito',
      VER_CARRITO,
    );
    return true;
  };
}

/**
 * Botón para agregar un plan al carrito. Si ya está, lo indica y avisa en
 * lugar de repetirlo; se quita desde el carrito.
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
  variante?: 'icono' | 'principal';
  tamano?: 'md' | 'lg';
  className?: string;
}) {
  const carrito = useCarrito();
  const agregar = useAgregarAlCarrito();
  const dentro = carrito.tiene(planId);
  const pulsar = () => agregar(planId, nombre);

  if (variante === 'principal') {
    return (
      <button
        type="button"
        onClick={pulsar}
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
  return (
    <button
      type="button"
      onClick={pulsar}
      aria-label={dentro ? `${nombre} ya está en tu carrito` : `Agregar ${nombre} al carrito`}
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
