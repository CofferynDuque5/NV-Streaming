#!/usr/bin/env bash
#
# setup.sh — Configuración y arranque automático de NV Streaming (backend).
#
# Un solo comando prepara y levanta la API en modo PRODUCCIÓN:
#   1) verifica requisitos (Node 20+),
#   2) crea el .env desde .env.example y genera secretos fuertes si faltan,
#   3) instala dependencias (npm ci),
#   4) compila el proyecto (build),
#   5) aplica migraciones (y siembra el catálogo si se pide),
#   6) arranca el servidor en producción.
#
# Uso:
#   bash setup.sh                 # prepara todo y arranca en producción
#   bash setup.sh --seed          # además siembra catálogo + admin (1ª vez)
#   bash setup.sh --build-only     # solo prepara/compila, NO arranca (CI / Docker)
#   bash setup.sh --dev            # modo desarrollo (tsx watch, recarga en caliente)
#   bash setup.sh --no-install     # omite npm ci (deps ya instaladas)
#
# Variables útiles (o defínelas en whatsapp-agent/.env):
#   DATABASE_URL   cadena de conexión a PostgreSQL (OBLIGATORIA)
#   PORT           puerto del servidor (por defecto 3000)
#   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   admin inicial (con --seed)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
AGENT="$ROOT/whatsapp-agent"

# ─── UI ───
c(){ printf '\033[%sm%s\033[0m' "$1" "$2"; }
say(){ printf '\n%s %s\n' "$(c '1;36' '»')" "$(c '1;37' "$*")"; }
ok(){  printf '  %s %s\n' "$(c '1;32' '✓')" "$*"; }
warn(){ printf '  %s %s\n' "$(c '1;33' '!')" "$*"; }
die(){ printf '\n%s %s\n' "$(c '1;31' '✗')" "$*" >&2; exit 1; }

# ─── Flags ───
MODE="prod"; DO_INSTALL=1; DO_SEED=0
for arg in "$@"; do
  case "$arg" in
    --dev)        MODE="dev" ;;
    --build-only) MODE="build" ;;
    --seed)       DO_SEED=1 ;;
    --no-install) DO_INSTALL=0 ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Opción desconocida: $arg (usa --help)" ;;
  esac
done

# ─── 0) Requisitos ───
say "Verificando requisitos…"
command -v node >/dev/null || die "Node.js no está instalado. Instala Node 20 o superior."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Se requiere Node 20+. Tienes $(node -v)."
command -v npm >/dev/null || die "npm no está disponible."
ok "Node $(node -v)"
[ -d "$AGENT" ] || die "No encuentro whatsapp-agent/ junto a setup.sh."
cd "$AGENT"

# ─── 1) Variables de entorno ───
say "Configurando variables de entorno (.env)…"
if [ ! -f .env ]; then
  [ -f .env.example ] || die "Falta whatsapp-agent/.env.example para generar el .env."
  cp .env.example .env
  ok "Creado whatsapp-agent/.env a partir de .env.example"
else
  ok ".env ya existe (no se sobrescribe)"
fi

# Genera secretos fuertes si están vacíos (JWT y clave de cifrado de credenciales).
gen_secret(){ node -e "console.log(require('crypto').randomBytes($1).toString('base64'))"; }
ensure_secret(){ # $1=clave  $2=bytes
  local key="$1" bytes="$2" line val
  line="$(grep -E "^${key}=" .env || true)"
  val="${line#${key}=}"
  if [ -z "$val" ] || echo "$val" | grep -qiE "cambia|change|xxxx|tu-|your-"; then
    local secret; secret="$(gen_secret "$bytes")"
    # Reemplaza la línea in-place (portable: reescribe el fichero).
    node -e "const fs=require('fs');const f='.env';let t=fs.readFileSync(f,'utf8');const re=new RegExp('^${key}=.*$','m');t=re.test(t)?t.replace(re,'${key}='+process.argv[1]):t+'\n${key}='+process.argv[1];fs.writeFileSync(f,t)" "$secret"
    ok "Generado $key (secreto aleatorio)"
  fi
}
ensure_secret "JWT_SECRET" 48
ensure_secret "CREDENTIALS_ENC_KEY" 32

# DATABASE_URL debe estar definida (env exportada tiene prioridad sobre .env).
DBURL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- || true)}"
if [ -z "$DBURL" ] || echo "$DBURL" | grep -qiE "usuario:password|cambia|localhost:5432/nv_stream$"; then
  warn "DATABASE_URL no parece configurada. Edita whatsapp-agent/.env o expórtala:"
  warn '  export DATABASE_URL="postgres://usuario:clave@host:5432/nombre_bd"'
  [ "$MODE" = "build" ] || die "Sin DATABASE_URL válida no puedo migrar ni arrancar."
else
  ok "DATABASE_URL detectada"
fi

# ─── 2) Dependencias ───
if [ "$DO_INSTALL" = "1" ]; then
  say "Instalando dependencias (npm ci)…"
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  ok "Dependencias instaladas"
else
  warn "Omitiendo instalación (--no-install)"
fi

# ─── Modo desarrollo: recarga en caliente y salir ───
if [ "$MODE" = "dev" ]; then
  say "Arrancando en DESARROLLO (tsx watch)…"
  exec npm run dev
fi

# ─── 3) Compilación ───
say "Compilando (build)…"
npm run build
ok "Compilado a dist/"

# ─── 4) Migraciones (+ seed opcional) ───
# En --build-only no se toca la BD (útil al construir imágenes/CI sin BD).
if [ "$MODE" = "build" ]; then
  say "Preparación completada (--build-only). Migra y arranca con: npm run migrate:prod && npm start"
  exit 0
fi
say "Aplicando migraciones de la base de datos…"
npm run migrate
ok "Esquema aplicado"
if [ "$DO_SEED" = "1" ]; then
  say "Sembrando catálogo + admin (idempotente)…"
  npm run seed
  ok "Datos iniciales listos"
fi

# ─── 5) Arranque ───
say "Arrancando el servidor en PRODUCCIÓN…"
export NODE_ENV=production
ok "Escuchando en el puerto ${PORT:-3000} · health: /health"
exec node dist/index.js
