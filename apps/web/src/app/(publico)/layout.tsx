import type { ReactNode } from 'react';
import { CabeceraSitio, PieSitio } from '@/componentes/sitio';

export default function LayoutPublico({ children }: { children: ReactNode }) {
  return (
    <>
      <CabeceraSitio />
      <main id="contenido">{children}</main>
      <PieSitio />
    </>
  );
}
