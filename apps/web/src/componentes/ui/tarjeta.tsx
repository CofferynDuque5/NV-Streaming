import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

export function Tarjeta({ className, ...resto }: ComponentProps<'section'>) {
  return (
    <section
      className={clsx('rounded-nv border border-borde bg-superficie shadow-nv', className)}
      {...resto}
    />
  );
}

export function CabeceraTarjeta({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-5 py-4 sm:px-6">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {descripcion && <p className="text-sm text-tinta-suave">{descripcion}</p>}
      </div>
      {accion}
    </header>
  );
}
