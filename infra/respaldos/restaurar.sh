#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restauración de copias de NV Streaming (se ejecuta DENTRO del contenedor «respaldos»).
# Desde el servidor, usa infra/restaurar.sh, que además detiene y arranca la aplicación.
#
#   restaurar listar                 copias locales (y remotas si hay RESPALDO_REMOTO)
#   restaurar descargar <copia>      baja una copia remota a /respaldos
#   restaurar probar [<copia>]       PRUEBA de restauración en una base temporal (no toca nada)
#   restaurar real <copia>           reemplaza la base de datos y los comprobantes
#   restaurar entorno <copia>        muestra el .env.produccion guardado en la copia
# <copia> es el nombre de la carpeta (nv-AAAAMMDD-HHMMSS) o «ultima».
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

DESTINO="${RESPALDO_DIR:-/respaldos}"
ALMACEN="${ALMACEN_DIR:-/datos/almacen}"
BD="${PGDATABASE:?Falta PGDATABASE}"
BD_PRUEBA="${BD}_prueba_restauracion"

registro() { echo "$(date '+%F %T') [restaurar] $*"; }
fallo() {
  registro "ERROR: $*" >&2
  exit 1
}

[[ -n "${RESPALDO_CLAVE:-}" ]] || fallo "Falta RESPALDO_CLAVE (la clave con la que se cifraron las copias)."
mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME"

descifrar() {
  gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$1" 3<<<"$RESPALDO_CLAVE"
}

# Resuelve «ultima» o un nombre a la carpeta local y comprueba sus sumas.
carpeta_de() {
  local nombre="${1:-ultima}" copias
  if [[ "$nombre" == "ultima" ]]; then
    copias=("$DESTINO"/nv-*/)
    [[ -d "${copias[-1]}" ]] || fallo "No hay copias en $DESTINO."
    nombre="$(basename "${copias[-1]}")"
  fi
  [[ "$nombre" =~ ^nv-[0-9]{8}-[0-9]{6}$ ]] || fallo "Nombre de copia no válido: $nombre"
  [[ -d "$DESTINO/$nombre" ]] || fallo "No existe $DESTINO/$nombre. ¿Falta descargarla? (restaurar descargar $nombre)"
  (cd "$DESTINO/$nombre" && sha256sum --check --status SHA256SUMS) || fallo "La copia $nombre está dañada (las sumas no coinciden)."
  echo "$DESTINO/$nombre"
}

# Vuelca la base de una copia en la base indicada (que debe existir y estar vacía).
volcar_bd() {
  local carpeta="$1" base="$2"
  descifrar "$carpeta/bd.dump.gz.gpg" | gunzip | pg_restore --no-owner --exit-on-error -d "$base"
}

consulta() { PGOPTIONS="-c client_min_messages=warning" psql -XAtq -d "$1" -c "$2"; }

listar() {
  echo "Copias locales en $DESTINO:"
  local c
  for c in "$DESTINO"/nv-*/; do
    [[ -d "$c" ]] || continue
    printf '  %s  %s\n' "$(basename "$c")" "$(du -sh "$c" | cut -f1)"
  done
  if [[ -n "${RESPALDO_REMOTO:-}" ]]; then
    echo "Copias en $RESPALDO_REMOTO:"
    rclone lsf --dirs-only "$RESPALDO_REMOTO" | sed 's|/$||; s|^|  |'
  fi
}

descargar() {
  local nombre="${1:?Indica la copia (nv-AAAAMMDD-HHMMSS)}"
  [[ -n "${RESPALDO_REMOTO:-}" ]] || fallo "RESPALDO_REMOTO no está configurado."
  [[ "$nombre" =~ ^nv-[0-9]{8}-[0-9]{6}$ ]] || fallo "Nombre de copia no válido: $nombre"
  rclone copy "$RESPALDO_REMOTO/$nombre" "$DESTINO/$nombre"
  carpeta_de "$nombre" >/dev/null
  registro "Copia descargada en $DESTINO/$nombre"
}

probar() {
  local carpeta
  carpeta="$(carpeta_de "${1:-ultima}")"
  registro "Prueba de restauración de $(basename "$carpeta") en la base temporal $BD_PRUEBA"
  consulta postgres "DROP DATABASE IF EXISTS \"$BD_PRUEBA\" WITH (FORCE)"
  consulta postgres "CREATE DATABASE \"$BD_PRUEBA\""
  trap 'consulta postgres "DROP DATABASE IF EXISTS \"$BD_PRUEBA\" WITH (FORCE)" || true' EXIT
  volcar_bd "$carpeta" "$BD_PRUEBA"

  local sql_tablas="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  local sql_migr="SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL"
  printf '\n%-28s %12s %12s\n' "Comprobación" "En la copia" "En uso ahora"
  printf '%-28s %12s %12s\n' "Tablas" "$(consulta "$BD_PRUEBA" "$sql_tablas")" "$(consulta "$BD" "$sql_tablas")"
  printf '%-28s %12s %12s\n' "Migraciones aplicadas" "$(consulta "$BD_PRUEBA" "$sql_migr")" "$(consulta "$BD" "$sql_migr")"
  local t
  for t in usuarios clientes suscripciones facturas pagos auditoria; do
    printf '%-28s %12s %12s\n' "Filas en $t" \
      "$(consulta "$BD_PRUEBA" "SELECT count(*) FROM $t" 2>/dev/null || echo -)" \
      "$(consulta "$BD" "SELECT count(*) FROM $t" 2>/dev/null || echo -)"
  done
  if [[ -f "$carpeta/almacen.tar.gz.gpg" ]]; then
    printf '%-28s %12s\n' "Comprobantes en la copia" "$(descifrar "$carpeta/almacen.tar.gz.gpg" | tar -tzf - | grep -vc '/$' || true)"
  fi
  if [[ -f "$carpeta/entorno.gpg" ]]; then
    descifrar "$carpeta/entorno.gpg" | grep -q '^CLAVE_CIFRADO=' || fallo "La copia de .env.produccion no tiene CLAVE_CIFRADO."
    printf '%-28s %12s\n' "Copia de .env.produccion" "correcta"
  fi
  echo
  registro "PRUEBA SUPERADA: la copia se descifra y se restaura completa. La base temporal se borra."
}

real() {
  local carpeta
  carpeta="$(carpeta_de "${1:?Indica la copia o «ultima»}")"
  registro "Restaurando $(basename "$carpeta") sobre la base $BD (se reemplaza por completo)"
  consulta postgres "DROP DATABASE IF EXISTS \"$BD\" WITH (FORCE)"
  consulta postgres "CREATE DATABASE \"$BD\""
  volcar_bd "$carpeta" "$BD"
  registro "Base de datos restaurada."
  if [[ -f "$carpeta/almacen.tar.gz.gpg" ]]; then
    if [[ "$(id -u)" -ne 0 ]]; then
      registro "Aviso: los comprobantes solo se restauran como root (usa infra/restaurar.sh)."
    else
      find "$ALMACEN" -mindepth 1 -delete
      descifrar "$carpeta/almacen.tar.gz.gpg" | tar -xzf - -C "$ALMACEN"
      # La API corre como el usuario «node» (uid 1000).
      chown -R 1000:1000 "$ALMACEN"
      registro "Comprobantes restaurados."
    fi
  fi
}

entorno() {
  local carpeta
  carpeta="$(carpeta_de "${1:?Indica la copia o «ultima»}")"
  [[ -f "$carpeta/entorno.gpg" ]] || fallo "Esta copia no incluye el .env.produccion."
  descifrar "$carpeta/entorno.gpg"
}

orden="${1:-}"
shift || true
case "$orden" in
  listar) listar ;;
  descargar) descargar "$@" ;;
  probar) probar "$@" ;;
  real) real "$@" ;;
  entorno) entorno "$@" ;;
  resolver) basename "$(carpeta_de "${1:-ultima}")" ;;
  *)
    sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
