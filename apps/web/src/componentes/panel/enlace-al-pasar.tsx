'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/**
 * Enlace de menú que no precarga su página al aparecer en pantalla, solo cuando el
 * puntero pasa por encima o recibe el foco. Un menú con 20 módulos disparaba 20 a 30
 * precargas en cada página del panel, todas contra la API y la base a la vez.
 */
export function EnlaceAlPasar({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...resto
}: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string }) {
  const router = useRouter();
  const precargar = () => router.prefetch(href);
  return (
    <Link
      {...resto}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        precargar();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        precargar();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        precargar();
        onTouchStart?.(e);
      }}
    />
  );
}
