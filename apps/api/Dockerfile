# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Imagen de la API de NV Streaming. La misma imagen sirve para:
#   · la API HTTP          (orden por defecto: node dist/main.js)
#   · el trabajador        (node dist/trabajador.js)
# y el destino «migrar» crea una imagen aparte con Prisma para aplicar las
# migraciones y crear el primer administrador (no se usa para servir tráfico).
#
# Se construye desde la raíz del repositorio:
#   docker build -f apps/api/Dockerfile -t nv-streaming/api .
#   docker build -f apps/api/Dockerfile --target migrar -t nv-streaming/migrar .
# Funciona en amd64 y en arm64 (VM Ampere de Oracle Cloud).
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_IMAGEN=node:22-alpine

# ── Base con pnpm ────────────────────────────────────────────────────────────
FROM ${NODE_IMAGEN} AS base
ARG PNPM_VERSION=10.33.0
ENV CI=true
# «ca_extra» es opcional: solo hace falta si compilas detrás de un proxy que
# intercepta HTTPS (docker build --secret id=ca_extra,src=mi-ca.crt). No queda en la imagen.
RUN --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    npm install -g "pnpm@${PNPM_VERSION}" --no-fund --no-audit --loglevel=error \
    && npm cache clean --force
WORKDIR /repo

# ── Compilación ──────────────────────────────────────────────────────────────
FROM base AS compilacion
# 1) Descarga de dependencias según el lockfile (capa en caché mientras no cambie).
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    pnpm fetch --store-dir /pnpm/store
# 2) Código y dependencias solo de la API y sus paquetes (sin la web).
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store \
      --filter "@nv/api..." --filter "@nv/db..." --filter nv-streaming
# 3) Compila shared → db (genera el cliente de Prisma) → api.
RUN pnpm --filter "@nv/api..." run build
# 4) Copias autocontenidas según el lockfile: la API solo con dependencias de producción
#    (podadas) y el paquete de base de datos con la CLI de Prisma (migrar y crear el admin).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    pnpm --filter @nv/api deploy --prod --store-dir /pnpm/store \
      --config.inject-workspace-packages=true /salida/api \
    && pnpm --filter @nv/db deploy --store-dir /pnpm/store \
      --config.inject-workspace-packages=true /salida/db \
    && node infra/docker/podar-dependencias.mjs /salida/api \
    && cd /salida/api && rm -rf src test almacen Dockerfile ./*.ts tsconfig*.json pnpm-lock.yaml

# ── Migraciones y administración de la base (tarea de un solo uso) ──────────
FROM ${NODE_IMAGEN} AS migrar
ENV NODE_ENV=production
WORKDIR /app
COPY --from=compilacion /salida/db ./
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ── API y trabajador (imagen final por defecto) ──────────────────────────────
FROM ${NODE_IMAGEN} AS api
ENV NODE_ENV=production \
    API_PUERTO=4000 \
    ALMACEN_DIR=/datos/almacen
WORKDIR /app
COPY --from=compilacion /salida/api ./
COPY infra/docker/salud-trabajador.mjs ./salud-trabajador.mjs
# Carpeta privada de comprobantes (volumen en producción), la única con escritura.
RUN mkdir -p /datos/almacen && chown node:node /datos/almacen
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PUERTO||4000)+'/api/v1/salud').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
