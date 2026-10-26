import type { ReactNode } from 'react';

export function CabeceraPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{titulo}</h1>
        {descripcion && (
          <p className="max-w-2xl text-sm text-tinta-suave sm:text-[0.95rem]">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}
