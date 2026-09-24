import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EstadoVacio({
  icono: Icono,
  titulo,
  children,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-borde bg-hundida text-marca">
        <Icono className="size-5" aria-hidden="true" />
      </span>
      <div className="grid max-w-md gap-1">
        <h3 className="text-base font-semibold">{titulo}</h3>
        {children && <p className="text-sm text-tinta-suave">{children}</p>}
      </div>
      {accion}
    </div>
  );
}
