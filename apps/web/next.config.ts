import type { NextConfig } from 'next';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

// Política de contenido: todo sale de la propia web (fuentes, imágenes y la API en /api).
// Next.js escribe scripts en línea para hidratar la página y React usa estilos en línea, por
// eso 'unsafe-inline'; el modo de desarrollo además necesita eval y el websocket de recarga.
const desarrollo = process.env.NODE_ENV === 'development';
const politicaContenido = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // data: para el código QR de la verificación en dos pasos; blob: para la vista previa
  // de un comprobante o una imagen antes de subirlos.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${desarrollo ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const cabecerasSeguridad = [
  { key: 'Content-Security-Policy', value: politicaContenido },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

// Producción con Docker (apps/web/Dockerfile): servidor autónomo con solo los archivos
// que usa. En desarrollo y en CI no cambia nada.
const autonomo = process.env.WEB_SALIDA === 'standalone';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  ...(autonomo ? { output: 'standalone' as const } : {}),
  experimental: {
    // Las reescrituras a /api cortan a los 30 s por defecto; el asistente con el modelo
    // local puede tardar hasta un par de minutos en contestar.
    proxyTimeout: 150_000,
    // En contenedores (LXC/Proxmox) Next.js ve los núcleos del equipo anfitrión (p. ej.
    // 87) y lanza un proceso por cada uno al «Collecting page data»: en un VPS de 6 GB la
    // memoria se agota y la compilación se queda congelada. Con 2 basta y no se atasca.
    ...(autonomo ? { cpus: Number(process.env.WEB_COMPILAR_NUCLEOS) || 2 } : {}),
  },
  // La web y la API comparten origen: el navegador llama a /api y Next.js lo reenvía.
  // Así la cookie de sesión es de primera parte y no hace falta CORS.
  async rewrites() {
    return [{ source: '/api/:ruta*', destination: `${API}/api/:ruta*` }];
  },
  async headers() {
    return [{ source: '/:ruta*', headers: cabecerasSeguridad }];
  },
};

export default config;
