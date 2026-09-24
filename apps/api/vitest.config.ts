import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['test/integracion/**/*.test.ts'],
          globalSetup: ['test/integracion/preparar-base.ts'],
          // Todas las pruebas comparten una base de datos: se ejecutan en serie.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
