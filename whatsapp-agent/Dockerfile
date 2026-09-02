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

# Artefactos compilados y datos de arranque. Se copia la PLANTILLA versionada
# (seed-cms.example.json siempre existe en el repo); el seeder la usa como
# respaldo si no hay un seed-cms.json local. Se copian ambos patrones con '*'
# para que, si existe un seed-cms.json propio, también entre.
COPY --from=build /app/dist ./dist
COPY seed-cms*.json ./

# Ejecuta como usuario sin privilegios (buena práctica).
USER node
EXPOSE 3000

# Healthcheck del contenedor (usa el endpoint /health del servidor).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Arranque: (1) migra el esquema [crítico], (2) siembra catálogo real + admin
# desde SEED_ADMIN_* [idempotente, best-effort], (3) levanta la API. Así, con
# `docker compose up`, la web no arranca vacía. Todo usa el JS ya compilado
# (dist/), sin tsx, para funcionar en la imagen de producción (--omit=dev).
CMD ["sh", "-c", "node dist/db/migrate.js && (node dist/scripts/seed.js || echo 'seed omitido') && node dist/index.js"]
