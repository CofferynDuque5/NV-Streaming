import type { MetadataRoute } from 'next';

const ORIGEN = process.env.WEB_ORIGEN ?? 'http://localhost:3000';

/** Los buscadores ven la tienda; los paneles, la cuenta y la API quedan fuera. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/cuenta', '/panel', '/revendedor', '/ajustes', '/api', '/pago-sandbox'],
    },
    sitemap: `${ORIGEN}/sitemap.xml`,
  };
}
