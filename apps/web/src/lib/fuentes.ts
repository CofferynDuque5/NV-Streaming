import localFont from 'next/font/local';

/*
 * Fuentes servidas desde la propia web (sin CDN de fuentes): se precargan y no
 * bloquean el render. Son las variables de @fontsource-variable (subconjunto
 * «latin») con el eje de peso recortado a los pesos que usa el sitio: pesan un
 * 40 % menos (78 → 49 KB), lo que baja el LCP de la portada en móviles.
 * Para regenerarlas (fonttools, gratis):
 *   python3 -m fontTools.varLib.instancer <origen>.woff2 wght=400:800 -o dm.ttf
 *   pyftsubset dm.ttf --unicodes=<los del subconjunto latin> --layout-features='*' \
 *     --flavor=woff2 --output-file=src/fuentes/dm-sans-latin-400-800.woff2
 * (Exo 2 igual, con wght=500:800). Ambas tienen licencia SIL Open Font License.
 */
export const fuenteTexto = localFont({
  src: '../fuentes/dm-sans-latin-400-800.woff2',
  variable: '--fuente-texto',
  weight: '400 800',
  // "optional": si la fuente no llega a tiempo en la primera visita se usa la del sistema
  // (con métricas ajustadas) y no se vuelve a pintar el texto. Mejora el LCP en móviles lentos.
  display: 'optional',
});

// Títulos en Exo 2 (800), la letra de la marca NV.
export const fuenteTitulo = localFont({
  src: '../fuentes/exo-2-latin-500-800.woff2',
  variable: '--fuente-titulo',
  weight: '500 800',
  display: 'swap',
});
