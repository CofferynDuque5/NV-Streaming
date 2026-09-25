import type { NextConfig } from 'next';

const API = process.env.API_URL_INTERNA ?? 'http://localhost:4000';

const cabecerasSeguridad = [
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
