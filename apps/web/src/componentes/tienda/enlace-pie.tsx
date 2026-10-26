'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Enlace del pie que se marca como página actual cuando la visita ya está en ella. */
export function EnlacePieActual({ href, children }: { href: string; children: ReactNode }) {
  const actual = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={actual ? 'page' : undefined}
      className={actual ? 'font-semibold text-cian' : 'hover:text-tinta'}
    >
      {children}
    </Link>
  );
}
