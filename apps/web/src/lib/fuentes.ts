import localFont from 'next/font/local';

// Fuentes servidas desde la propia web (sin Google Fonts): se precargan y no bloquean el render.
export const fuenteTexto = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--fuente-texto',
  weight: '100 900',
  // "optional": si la fuente no llega a tiempo en la primera visita se usa la del sistema
  // (con métricas ajustadas) y no se vuelve a pintar el texto. Mejora el LCP en móviles lentos.
  display: 'optional',
});

export const fuenteTitulo = localFont({
  src: '../../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2',
  variable: '--fuente-titulo',
  weight: '100 800',
  display: 'swap',
});
