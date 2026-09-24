import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const configuracion = [
  {
    ignores: [
      '.next/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // La imagen del QR es un SVG en data URL generado por la API: next/image no aporta nada aquí.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default configuracion;
