#!/usr/bin/env bash
#
# arrancar.sh — Levanta NV Streaming en desarrollo local de un solo tirón:
#   1) crea la base de datos (si falta)
#   2) backend: npm install (si falta) → build → migrate → crea admin → arranca
#   3) frontend: apunta config.js al backend y lo sirve como estático
#
# Uso:
#   bash arrancar.sh          # arranca todo
#   bash arrancar.sh stop     # detiene backend y frontend
#
# Puedes sobreescribir cualquier valor por variables de entorno, p.ej.:
#   DB_PORT=5433 ADMIN_PASS=MiClave bash arrancar.sh
#
set -uo pipefail

# ─────────── Configuración (con valores por defecto) ───────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nv}"
DB_PASS="${DB_PASS:-nvpass}"
DB_NAME="${DB_NAME:-nv_streaming}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nv.com}"
ADMIN_PASS="${ADMIN_PASS:-Admin12345}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
AGENT="$ROOT/whatsapp-agent"
SITE="$ROOT/site"
RUN="$ROOT/.run"; mkdir -p "$RUN"
DBURL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
say(){ printf '\n\033[1;36m» %s\033[0m\n' "$*"; }
err(){ printf '\033[1;31m✗ %s\033[0m\n' "$*"; }

# ─────────── stop ───────────
if [ "${1:-}" = "stop" ]; then
  for f in "$RUN/backend.pid" "$RUN/frontend.pid"; do
    [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null && echo "detenido $(basename "$f" .pid)"; rm -f "$f"
  done
  exit 0
fi

# ─────────── 0) Requisitos ───────────
command -v node >/dev/null || { err "Falta Node.js (instala Node 20+)"; exit 1; }
command -v psql >/dev/null || { err "Falta psql (PostgreSQL). Instálalo o crea la BD a mano."; }

# ─────────── 1) Base de datos ───────────
say "Base de datos ($DB_NAME en $DB_HOST:$DB_PORT)…"
if PGPASSWORD="$DB_PASS" psql "$DBURL" -tAc 'SELECT 1' >/dev/null 2>&1; then
  echo "  ✓ ya existe y es accesible"
else
  echo "  · intento crearla (puede pedir tu contraseña de PostgreSQL)…"
  # Crea el rol y la base como superusuario si es posible. Si falla, avisa.
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null
  if ! PGPASSWORD="$DB_PASS" psql "$DBURL" -tAc 'SELECT 1' >/dev/null 2>&1; then
    err "No pude crear/conectar la BD. Créala a mano y reintenta:"
    echo "     CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
    echo "     CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    exit 1
  fi
  echo "  ✓ creada"
fi

# ─────────── 2) Backend ───────────
cd "$AGENT"
[ -d node_modules ] || { say "Instalando dependencias del backend (npm install)…"; npm install --no-audit --no-fund; }

if [ ! -f .env ]; then
  say "Creando whatsapp-agent/.env…"
  JWT="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")"
  cat > .env <<EOF
NODE_ENV=development
PORT=${BACKEND_PORT}
DATABASE_URL=${DBURL}
JWT_SECRET=${JWT}
WHATSAPP_VERIFY_TOKEN=dev
WHATSAPP_APP_SECRET=dev
CRON_ENABLED=off
CORS_ORIGIN=*
EOF
  echo "  ✓ .env creado (JWT_SECRET generado)"
else
  echo "  ✓ .env ya existe (no lo toco)"
fi

say "Compilando y migrando el esquema…"
npm run build
npm run migrate

say "Asegurando usuario admin ($ADMIN_EMAIL)…"
npx tsx src/scripts/crear-admin.ts "$ADMIN_EMAIL" "$ADMIN_PASS" || true

say "Arrancando backend en :$BACKEND_PORT…"
nohup node dist/index.js > "$RUN/backend.log" 2>&1 &
echo $! > "$RUN/backend.pid"
for i in $(seq 1 20); do curl -s -m1 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1 && break; sleep 1; done
if curl -s -m2 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then echo "  ✓ backend UP"; else err "backend no respondió (ver $RUN/backend.log)"; exit 1; fi

# ─────────── 3) Frontend ───────────
say "Apuntando el frontend al backend y sirviéndolo en :$FRONTEND_PORT…"
# Ajusta config.js → api.base = http://localhost:BACKEND_PORT (idempotente)
perl -0pi -e "s#(api:\\s*\\{\\s*\\n?\\s*base:\\s*\")[^\"]*(\")#\${1}http://localhost:${BACKEND_PORT}\${2}#s" "$SITE/js/config.js" 2>/dev/null || true
cd "$SITE"
nohup python3 -m http.server "$FRONTEND_PORT" > "$RUN/frontend.log" 2>&1 &
echo $! > "$RUN/frontend.pid"
sleep 1

# ─────────── Listo ───────────
printf '\n\033[1;32m════════════════════════════════════════════\033[0m\n'
printf ' \033[1;32m✅ NV Streaming en marcha\033[0m\n'
printf '   Frontend : http://localhost:%s\n' "${FRONTEND_PORT}"
printf '   Backend  : http://localhost:%s   (/health)\n' "${BACKEND_PORT}"
printf '   Admin    : %s / %s\n' "${ADMIN_EMAIL}" "${ADMIN_PASS}"
printf '   Logs     : %s/backend.log · %s/frontend.log\n' "${RUN}" "${RUN}"
printf '   Detener  : bash arrancar.sh stop\n'
printf '\033[1;32m════════════════════════════════════════════\033[0m\n'
