import { Store, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { MENSAJES_MAYORISTA } from '@/componentes/planes-mayoristas';
import type { MayoristaTienda } from './precio-tarjeta';

/**
 * Aviso para un revendedor con sesión: qué precios está viendo (los de su
 * nivel) o por qué no puede verlos ahora.
 */
export function AvisoMayorista({ mayorista }: { mayorista: MayoristaTienda }) {
  const { vista } = mayorista;
  if (vista.estado !== 'ok') {
    return (
      <div
        role="status"
        className="flex gap-3 rounded-2xl border border-aviso/40 bg-aviso-suave px-4 py-3.5 text-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-aviso" aria-hidden="true" />
        <div className="grid gap-1">
          <p className="font-semibold">No podemos mostrarte tus precios de revendedor</p>
          <p className="text-tinta-suave">{MENSAJES_MAYORISTA[vista.estado]}</p>
          <Link href="/revendedor" className="w-fit font-medium text-cian hover:underline">
            Ir a mi panel de revendedor
          </Link>
        </div>
      </div>
    );
  }
  const { catalogo } = vista;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-acento/40 bg-acento-suave px-4 py-3.5 text-sm">
      <Store className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="font-semibold">Tus precios de revendedor · Nivel {catalogo.nivel.nombre}</p>
        <p className="text-tinta-suave">
          Ves el precio mayorista de tu nivel, no el del público. Las compras se cobran de tu saldo
          en USD
          {catalogo.tasaVes ? '; en bolívares ves el equivalente con la tasa de hoy.' : '.'} Los
          planes sin precio mayorista no se revenden.
        </p>
      </div>
    </div>
  );
}
