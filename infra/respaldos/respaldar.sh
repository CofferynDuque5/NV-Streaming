#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copia de seguridad de NV Streaming (se ejecuta DENTRO del contenedor «respaldos»).
# Desde el servidor, usa infra/respaldar.sh.
#
# Cada copia es una carpeta /respaldos/nv-AAAAMMDD-HHMMSS con:
#   bd.dump.gz.gpg       base de datos (pg_dump formato personalizado → gzip → gpg AES-256)
#   almacen.tar.gz.gpg   comprobantes de pago subidos por los clientes
#   entorno.gpg          copia del .env.produccion (claves necesarias para restaurar)
#   info.txt, SHA256SUMS versión, última migración y sumas de verificación
# Nada se escribe sin cifrar en el disco. La clave es RESPALDO_CLAVE: guárdala fuera del
# servidor (gestor de contraseñas). Sin ella las copias NO se pueden abrir.
#
# Variables: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, RESPALDO_CLAVE,
#   RESPALDO_COPIAS_LOCALES (7), RESPALDO_REMOTO (p. ej. «oci:nv-respaldos», vacío = no subir),
#   RESPALDO_DIAS_REMOTO (30), RESPALDO_URL_AVISO (URL «push» de Uptime Kuma, opcional).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

DESTINO="${RESPALDO_DIR:-/respaldos}"
ALMACEN="${ALMACEN_DIR:-/datos/almacen}"
ENTORNO="${RESPALDO_ENTORNO:-/config/entorno}"
COPIAS="${RESPALDO_COPIAS_LOCALES:-7}"
DIAS_REMOTO="${RESPALDO_DIAS_REMOTO:-30}"

registro() { echo "$(date '+%F %T') [respaldo] $*"; }
fallo() {
  registro "ERROR: $*" >&2
  exit 1
}

[[ -n "${RESPALDO_CLAVE:-}" ]] || fallo "Falta RESPALDO_CLAVE en .env.produccion."
[[ "${#RESPALDO_CLAVE}" -ge 20 ]] || fallo "RESPALDO_CLAVE es demasiado corta (mínimo 20 caracteres)."
[[ "$COPIAS" =~ ^[1-9][0-9]*$ ]] || fallo "RESPALDO_COPIAS_LOCALES debe ser un número mayor que 0."
[[ -w "$DESTINO" ]] || fallo "No se puede escribir en $DESTINO."
mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME"

# Cifrado simétrico con la clave por un descriptor (nunca en la línea de órdenes).
cifrar() {
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 --output "$1" 3<<<"$RESPALDO_CLAVE"
}

nombre="nv-$(date +%Y%m%d-%H%M%S)"
parcial="$DESTINO/.${nombre}.parcial"
trap 'rm -rf "$parcial"' EXIT
mkdir -p "$parcial"

registro "Inicio de la copia $nombre"
pg_isready -q -t 30 || fallo "PostgreSQL no responde."

# 1) Base de datos. -Z0: sin comprimir en pg_dump para que gzip lo haga en el flujo.
pg_dump --format=custom --compress=0 --no-owner | gzip -6 | cifrar "$parcial/bd.dump.gz.gpg"

# 2) Comprobantes (si la carpeta existe; al principio puede estar vacía).
if [[ -d "$ALMACEN" ]]; then
  tar -C "$ALMACEN" -czf - . | cifrar "$parcial/almacen.tar.gz.gpg"
fi

# 3) Configuración (contiene CLAVE_CIFRADO: sin ella no se leen los datos cifrados).
if [[ -r "$ENTORNO" ]]; then
  cifrar "$parcial/entorno.gpg" <"$ENTORNO"
elif [[ -e "$ENTORNO" ]]; then
  registro "AVISO: no se puede leer $ENTORNO (¿NV_UID distinto del dueño de .env.produccion?); la copia no lo incluye."
fi

# 4) Información y sumas de verificación.
migracion="$(psql -XAtqc 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1' 2>/dev/null || echo desconocida)"
{
  echo "copia=$nombre"
  echo "fecha=$(date -Iseconds)"
  echo "base_de_datos=${PGDATABASE:-}"
  echo "servidor=$(psql -XAtqc 'SHOW server_version' 2>/dev/null || echo desconocido)"
  echo "ultima_migracion=$migracion"
} >"$parcial/info.txt"
(cd "$parcial" && sha256sum -- *.gpg info.txt >SHA256SUMS)

mv "$parcial" "$DESTINO/$nombre"
trap - EXIT
tamano="$(du -sh "$DESTINO/$nombre" | cut -f1)"
registro "Copia local lista: $DESTINO/$nombre ($tamano)"

# 5) Retención local: se conservan las N copias más recientes.
# El nombre lleva la fecha, así que el orden alfabético es el cronológico.
copias=("$DESTINO"/nv-*/)
sobran=$((${#copias[@]} - COPIAS))
for ((i = 0; i < sobran; i++)); do
  rm -rf "${copias[$i]:?}"
  registro "Copia antigua borrada: $(basename "${copias[$i]}")"
done

# 6) Copia fuera del servidor (opcional pero muy recomendada).
if [[ -n "${RESPALDO_REMOTO:-}" ]]; then
  rclone copy --no-traverse "$DESTINO/$nombre" "$RESPALDO_REMOTO/$nombre" ||
    fallo "No se pudo subir la copia a $RESPALDO_REMOTO (la copia local sí está)."
  registro "Copia subida a $RESPALDO_REMOTO/$nombre"
  if [[ "$DIAS_REMOTO" =~ ^[1-9][0-9]*$ ]]; then
    if ! rclone delete --min-age "${DIAS_REMOTO}d" "$RESPALDO_REMOTO" ||
      ! rclone rmdirs --leave-root "$RESPALDO_REMOTO"; then
      registro "Aviso: no se pudieron borrar copias remotas antiguas."
    fi
  fi
fi

date -Iseconds >"$DESTINO/ULTIMA_COPIA_OK"

# 7) Aviso a Uptime Kuma (monitor de tipo «Push»): si deja de llegar, te avisa.
#    Usa la dirección interna, p. ej. http://uptime-kuma:3001/api/push/XXXX?status=up
if [[ -n "${RESPALDO_URL_AVISO:-}" ]]; then
  perl -MHTTP::Tiny -e 'exit(HTTP::Tiny->new(timeout => 15)->get($ARGV[0])->{success} ? 0 : 1)' \
    "$RESPALDO_URL_AVISO" || registro "Aviso: Uptime Kuma no respondió ($RESPALDO_URL_AVISO)."
fi
registro "Copia terminada."
