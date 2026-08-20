# ─────────────────────────── Build stage ───────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Instala TODAS las dependencias (incluye dev para compilar TypeScript).
COPY package.json package-lock.json ./
RUN npm ci

# Compila a JavaScript y copia el SQL (tsc no procesa .sql).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && cp src/db/schema.sql dist/db/schema.sql

# ────────────────────────── Runtime stage ──────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Solo dependencias de producción.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefactos compilados.
COPY --from=build /app/dist ./dist

# Ejecuta como usuario sin privilegios (incluido en la imagen oficial).
USER node

EXPOSE 3000

# Healthcheck contra /health (fetch nativo de Node 20).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migra el esquema (idempotente) y arranca el servidor.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
