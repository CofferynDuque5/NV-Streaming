# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Imagen de la web de NV Streaming (Next.js en modo autónomo «standalone»).
# Se construye desde la raíz del repositorio:
#   docker build -f apps/web/Dockerfile -t nv-streaming/web .
# Funciona en amd64 y en arm64 (VM Ampere de Oracle Cloud).
#
# API_URL_INTERNA queda fijada al compilar en las reescrituras de /api (next.config.ts):
# por defecto apunta al servicio «api» de docker-compose.prod.yml. En producción Caddy
# envía /api directamente a la API; la reescritura queda como respaldo.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_IMAGEN=node:22-alpine

FROM ${NODE_IMAGEN} AS base
ARG PNPM_VERSION=10.33.0
ENV CI=true
# «ca_extra» es opcional (proxy que intercepta HTTPS al compilar). No queda en la imagen.
RUN --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    npm install -g "pnpm@${PNPM_VERSION}" --no-fund --no-audit --loglevel=error \
    && npm cache clean --force
WORKDIR /repo

FROM base AS compilacion
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    pnpm fetch --store-dir /pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=ca_extra \
    if [ -f /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra; fi; \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store \
      --filter "@nv/web..." --filter nv-streaming
ARG API_URL_INTERNA=http://api:4000
# Dirección pública (para las imágenes al compartir de las páginas pre-generadas).
ARG WEB_ORIGEN=http://localhost:3000
ENV API_URL_INTERNA=${API_URL_INTERNA} \
    WEB_ORIGEN=${WEB_ORIGEN} \
    WEB_SALIDA=standalone \
    NEXT_TELEMETRY_DISABLED=1
# Compila shared y la web (salida autónoma en apps/web/.next/standalone).
RUN pnpm --filter "@nv/web..." run build

FROM ${NODE_IMAGEN} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=compilacion /repo/apps/web/.next/standalone ./
COPY --from=compilacion /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=compilacion /repo/apps/web/public ./apps/web/public
# Next.js guarda su caché de páginas y consultas en .next: solo esa carpeta admite escritura.
RUN chown -R node:node /app/apps/web/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/icon.png').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
