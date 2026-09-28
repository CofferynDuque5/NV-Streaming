import localFont from 'next/font/local';

// Fuentes servidas desde la propia web (sin CDN de fuentes): se precargan y no bloquean el render.
export const fuenteTexto = localFont({
  src: '../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2',
  variable: '--fuente-texto',
  weight: '100 1000',
  // "optional": si la fuente no llega a tiempo en la primera visita se usa la del sistema
  // (con métricas ajustadas) y no se vuelve a pintar el texto. Mejora el LCP en móviles lentos.
  display: 'optional',
});

// Títulos en Exo 2 (800), la letra de la marca NV.
export const fuenteTitulo = localFont({
  src: '../../node_modules/@fontsource-variable/exo-2/files/exo-2-latin-wght-normal.woff2',
  variable: '--fuente-titulo',
  weight: '100 900',
  display: 'swap',
});
