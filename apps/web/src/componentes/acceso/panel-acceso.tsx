import type { ReactNode } from 'react';

/** Tarjeta de las pantallas de acceso. */
export function PanelAcceso({
  titulo,
  descripcion,
  children,
  pie,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-6 rounded-[1.25rem] border border-borde bg-superficie p-6 shadow-nv sm:p-8">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold">{titulo}</h1>
          {descripcion && <p className="text-sm text-tinta-suave">{descripcion}</p>}
        </div>
        {children}
      </section>
      {pie && <div className="text-center text-sm text-tinta-suave">{pie}</div>}
    </div>
  );
}
