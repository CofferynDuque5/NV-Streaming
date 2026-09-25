import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Tono = 'info' | 'exito' | 'aviso' | 'peligro';

const estilos: Record<Tono, string> = {
  info: 'border-marca/25 bg-marca-suave text-tinta',
  exito: 'border-exito/30 bg-exito-suave text-tinta',
  aviso: 'border-aviso/30 bg-aviso-suave text-tinta',
  peligro: 'border-peligro/30 bg-peligro-suave text-tinta',
};

const iconos: Record<Tono, ReactNode> = {
  info: <Info className="size-4 text-marca" />,
  exito: <CircleCheck className="size-4 text-exito" />,
  aviso: <TriangleAlert className="size-4 text-aviso" />,
  peligro: <CircleAlert className="size-4 text-peligro" />,
};

export function Alerta({
  tono = 'info',
  titulo,
  children,
  className,
}: {
  tono?: Tono;
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', estilos[tono], className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {iconos[tono]}
      </span>
      <div className="grid gap-0.5">
        {titulo && <p className="font-medium">{titulo}</p>}
        {children && <div className="text-tinta-suave">{children}</div>}
      </div>
    </div>
  );
}
