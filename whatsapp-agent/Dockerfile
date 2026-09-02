# NV Streaming — Backend (Node 20 + TypeScript → PostgreSQL).
# Imagen de PRODUCCIÓN en dos etapas: se compila con las devDependencies y la
# imagen final solo lleva el JS compilado + dependencias de producción.

# ── Etapa 1: build ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build            # tsc → dist/ + copia schema.sql

# ── Etapa 2: runtime ──
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Solo dependencias de producción (imagen ligera).
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Artefactos compilados y ficheros de datos necesarios en runtime.
COPY --from=build /app/dist ./dist
COPY seed-cms.json ./seed-cms.json

# Ejecuta como usuario sin privilegios (buena práctica).
USER node
EXPOSE 3000

# Healthcheck del contenedor (usa el endpoint /health del servidor).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Arranque: aplica migraciones y levanta la API. El seed (catálogo/admin) se
# ejecuta aparte y de forma controlada:  docker compose run --rm app npm run seed
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
