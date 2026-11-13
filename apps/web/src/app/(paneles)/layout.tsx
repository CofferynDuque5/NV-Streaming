import { cssTemporada } from '@nv/shared';
import type { ReactNode } from 'react';
import { DecoracionTemporada } from '@/componentes/tienda/decoracion-temporada';
import { leerTemaPublico } from '@/lib/tienda';
import './paneles.css';

/**
 * Estilos de los paneles y la temporada vigente (Navidad, Halloween…), igual
 * que en la tienda pero con un adorno discreto. Cada sección tiene su propio marco.
 */
export default async function LayoutPaneles({ children }: { children: ReactNode }) {
  const { temporada } = await leerTemaPublico();
  return (
    <>
      {temporada && (
        <>
          <style>{cssTemporada(temporada, 'html:root')}</style>
          <DecoracionTemporada temporada={temporada} discreta />
        </>
      )}
      {children}
    </>
  );
}
