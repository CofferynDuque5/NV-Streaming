import type { MetadataRoute } from 'next';

/**
 * Manifiesto de la app: con él, Android ofrece «Instalar app» y el iPhone la
 * agrega a la pantalla de inicio con su nombre e ícono, abriéndose a pantalla
 * completa (sin la barra del navegador).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NV Streaming',
    short_name: 'NV Streaming',
    description:
      'Servicios de streaming autorizados, con activación, pagos y soporte en un solo lugar.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#04050d',
    theme_color: '#04050d',
    icons: [
      { src: '/app/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/app/icono-mascara-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
