import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ProveedorNotificaciones } from '@/componentes/ui/notificaciones';
import { fuenteTexto, fuenteTitulo } from '@/lib/fuentes';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'NV Streaming', template: '%s · NV Streaming' },
  description:
    'Servicios de streaming autorizados, con activación, pagos y soporte en un solo lugar.',
  applicationName: 'NV Streaming',
  // Las imágenes para compartir (opengraph-image.jpg) necesitan la dirección pública del sitio.
  metadataBase: new URL(process.env.WEB_ORIGEN ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'es',
    siteName: 'NV Streaming',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#04050d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${fuenteTexto.variable} ${fuenteTitulo.variable}`}>
      <body>
        <ProveedorNotificaciones>{children}</ProveedorNotificaciones>
      </body>
    </html>
  );
}
