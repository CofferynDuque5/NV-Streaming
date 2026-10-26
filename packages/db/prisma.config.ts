import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Las variables viven en el .env de la raíz del monorepo.
config({ path: ['../../.env', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
