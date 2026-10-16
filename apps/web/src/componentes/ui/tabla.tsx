import clsx from 'clsx';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Tabla con desplazamiento horizontal en pantallas estrechas. */
export function Tabla({ children, minimo = '40rem' }: { children: ReactNode; minimo?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  );
}

export function Encabezados({
  columnas,
}: {
  columnas: (string | { texto: string; className?: string })[];
}) {
  return (
    <thead className="text-xs text-tinta-tenue">
      <tr className="border-b border-borde">
        {columnas.map((c, i) => {
          const texto = typeof c === 'string' ? c : c.texto;
          return (
            <th
              key={`${texto}-${i}`}
              scope="col"
              className={clsx(
                'py-3 font-medium',
                i === 0 ? 'px-5 sm:px-6' : 'px-3',
                typeof c === 'string' ? undefined : c.className,
              )}
            >
              {texto}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function Cuerpo({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-borde">{children}</tbody>;
}

/** Fila; si lleva `href`, toda la fila es un enlace a ese detalle. */
export function Fila({
  href,
  children,
  className,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={clsx(href && 'group relative hover:bg-hundida/60', className)}>{children}</tr>
  );
}

export function Celda({
  primera,
  className,
  ...resto
}: ComponentProps<'td'> & { primera?: boolean }) {
  return (
    <td
      className={clsx('py-3 align-middle', primera ? 'px-5 sm:px-6' : 'px-3', className)}
      {...resto}
    />
  );
}

/** Enlace que cubre toda la fila (la fila debe tener `href`). */
export function EnlaceFila({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="grid after:absolute after:inset-0 focus-visible:outline-none">
      {children}
    </Link>
  );
}
