import {
  BLOQUES_INICIO,
  cssPaleta,
  PALETA_PREDETERMINADA,
  RUTA_QUIENES_SOMOS,
  serviciosTienda,
} from '@nv/shared';
import type { ReactNode } from 'react';
import { AyudaFlotante } from '@/componentes/tienda/ayuda-flotante';
import { CabeceraTienda } from '@/componentes/tienda/cabecera';
import { CarritoLateralPerezoso } from '@/componentes/tienda/carrito-lateral-perezoso';
import { datosMenu } from '@/componentes/tienda/datos-menu';
import { PieTienda } from '@/componentes/tienda/pie';
import { leerPaginaPublicada } from '@/lib/sitio';
import { catalogoTienda, leerTemaPublico, monedaTienda, sesionTienda } from '@/lib/tienda';

/** Ancla de las preguntas frecuentes de la portada publicada, si tiene ese bloque. */
async function anclaPreguntas(): Promise<string | null> {
  const portada = await leerPaginaPublicada('/');
  const bloques = portada?.bloques ?? BLOQUES_INICIO;
  const b = bloques.find((x) => x.tipo === 'preguntas');
  return b?.ancla ? `/#${b.ancla}` : null;
}

/**
 * Ruta de «Quiénes somos» si está publicada, para el pie. Usa la misma lectura
 * en caché que la página (se renueva al publicar), no una petición por visita.
 */
async function rutaQuienesSomos(): Promise<string | null> {
  const pagina = await leerPaginaPublicada(RUTA_QUIENES_SOMOS);
  return pagina ? RUTA_QUIENES_SOMOS : null;
}

export default async function LayoutPublico({ children }: { children: ReactNode }) {
  const [tema, catalogo, moneda, sesion, preguntas, quienesSomos] = await Promise.all([
    leerTemaPublico(),
    catalogoTienda(),
    monedaTienda(),
    sesionTienda(),
    anclaPreguntas(),
    rutaQuienesSomos(),
  ]);
  const { categorias } = datosMenu(catalogo, moneda);
  return (
    <>
      {/* Variables de la paleta elegida en el editor (solo valores fijos de @nv/shared). */}
      {tema.paleta !== PALETA_PREDETERMINADA && (
        <style>{cssPaleta(tema.paleta, 'html:root')}</style>
      )}
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-superficie px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <CabeceraTienda />
      <main id="contenido">{children}</main>
      <PieTienda
        tema={tema}
        categorias={categorias}
        conSesion={sesion !== null}
        quienesSomos={quienesSomos}
      />
      <AyudaFlotante
        whatsapp={tema.contacto.whatsapp}
        correo={tema.contacto.correo}
        preguntas={preguntas}
      />
      <CarritoLateralPerezoso
        servicios={catalogo ? serviciosTienda(catalogo) : []}
        moneda={moneda}
        cliente={sesion?.rol === 'cliente'}
      />
    </>
  );
}
