#!/usr/bin/env bash
# Funciones comunes de los scripts de infra/ (se cargan con «source», no se ejecutan).
# shellcheck disable=SC2034  # Variables usadas por los scripts que cargan este archivo.

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTORNO="${NV_ENTORNO:-$RAIZ/.env.produccion}"
COMPOSE_ARCHIVO="$RAIZ/docker-compose.prod.yml"

if [[ -t 1 ]]; then
  C_AZUL=$'\033[1;34m' C_VERDE=$'\033[1;32m' C_AMARILLO=$'\033[1;33m' C_ROJO=$'\033[1;31m' C_FIN=$'\033[0m'
else
  C_AZUL='' C_VERDE='' C_AMARILLO='' C_ROJO='' C_FIN=''
fi

paso() { printf '\n%s==> %s%s\n' "$C_AZUL" "$*" "$C_FIN"; }
ok() { printf '%s  ✓ %s%s\n' "$C_VERDE" "$*" "$C_FIN"; }
aviso() { printf '%s  ! %s%s\n' "$C_AMARILLO" "$*" "$C_FIN" >&2; }
fallo() {
  printf '%s  ✗ %s%s\n' "$C_ROJO" "$*" "$C_FIN" >&2
  exit 1
}

# sudo solo si no somos root.
if [[ "$(id -u)" -eq 0 ]]; then SUDO=(); else SUDO=(sudo); fi

# docker directo si el usuario ya está en el grupo «docker»; si no, con sudo.
docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    "${SUDO[@]}" docker "$@"
  fi
}

# docker compose con el archivo de producción y el entorno.
dc() {
  docker_cmd compose -f "$COMPOSE_ARCHIVO" --env-file "$ENTORNO" "$@"
}

# Consulta SQL en la base de producción (dentro del contenedor de PostgreSQL).
psql_nv() {
  dc exec -T postgres psql -XAtq -U "$(valor POSTGRES_USER)" -d "$(valor POSTGRES_DB)" "$@"
}

requiere_entorno() {
  [[ -f "$ENTORNO" ]] || fallo "No existe $ENTORNO. Ejecuta primero infra/instalar.sh."
}

# Lee una variable de .env.produccion sin ejecutar el archivo (quita comillas).
valor() {
  local linea
  linea="$(grep -E "^$1=" "$ENTORNO" 2>/dev/null | tail -n 1 || true)"
  linea="${linea#*=}"
  linea="${linea#[\'\"]}"
  linea="${linea%[\'\"]}"
  printf '%s' "$linea"
}

# Espera a que un servicio esté «healthy» (máximo $2 segundos).
esperar_sano() {
  local servicio="$1" limite="${2:-300}" estado="" id t=0
  while ((t < limite)); do
    id="$(dc ps -q "$servicio" 2>/dev/null || true)"
    if [[ -n "$id" ]]; then
      estado="$(docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      [[ "$estado" == "healthy" ]] && return 0
    fi
    sleep 5
    t=$((t + 5))
  done
  aviso "$servicio no quedó sano en ${limite}s (estado: ${estado:-sin contenedor})."
  return 1
}

# Pregunta con valor por defecto; lee de la terminal aunque el script venga por una tubería.
preguntar() {
  local texto="$1" defecto="${2:-}" respuesta
  if [[ -n "$defecto" ]]; then texto="$texto [$defecto]"; fi
  read -r -p "  $texto: " respuesta </dev/tty
  printf '%s' "${respuesta:-$defecto}"
}

preguntar_secreto() {
  local respuesta
  read -r -s -p "  $1: " respuesta </dev/tty
  echo >&2
  printf '%s' "$respuesta"
}

confirmar() {
  local r
  read -r -p "  $1 [s/N]: " r </dev/tty
  [[ "$r" =~ ^[sSyY] ]]
}
