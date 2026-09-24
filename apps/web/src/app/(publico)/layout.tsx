import { cssPaleta, PALETA_PREDETERMINADA } from '@nv/shared';
import type { ReactNode } from 'react';
import { CabeceraSitio, PieSitio } from '@/componentes/sitio';
import { leerPaletaSitio } from '@/lib/sitio';

export default async function LayoutPublico({ children }: { children: ReactNode }) {
  const paleta = await leerPaletaSitio();
  return (
    <>
      {/* Variables de la paleta elegida en el editor (solo valores fijos de @nv/shared). */}
      {paleta !== PALETA_PREDETERMINADA && <style>{cssPaleta(paleta, 'html:root')}</style>}
      <CabeceraSitio />
      <main id="contenido">{children}</main>
      <PieSitio />
    </>
  );
}
