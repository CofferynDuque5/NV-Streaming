#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Pasa la base de datos de una externa (Supabase, Neon) al contenedor «postgres» de
# este mismo servidor (perfil base-local). Cada consulta pasa de ~250 ms (ida y vuelta
# a otro país) a menos de 1 ms.
#
#   bash infra/pasar-a-base-local.sh
#
# Qué hace:
#   1. Detiene la tienda (nada cambia mientras se copia).
#   2. Hace una copia de seguridad de la base externa (la de siempre, cifrada y a B2).
#   3. Guarda la configuración actual en .env.produccion.externa.
#   4. Cambia .env.produccion a la base local con una contraseña nueva aleatoria
#      (no se muestra en pantalla ni queda en ningún registro).
#   5. Arranca PostgreSQL local, restaura en él la copia del paso 2 y arranca la tienda.
#
# La base externa NO se toca: queda como estaba, de respaldo. Los comprobantes de pago
# tampoco se tocan (siguen en el disco del servidor).
# Si algo falla después del paso 3, vuelve solo a la configuración anterior.
# Volver a mano: cp .env.produccion.externa .env.produccion && bash infra/actualizar.sh
# Tiempo con la tienda detenida: unos 5–10 minutos.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

base_local && fallo "La base ya está en este servidor (BASE_HOST vacío o «postgres»). No hay nada que hacer."

GUARDADO="$RAIZ/.env.produccion.externa"
[[ ! -e "$GUARDADO" ]] || fallo "Ya existe $GUARDADO de un intento anterior. Revísalo y bórralo o renómbralo antes de repetir."

# Un volumen de datos anterior (de otra versión de PostgreSQL o con datos viejos) no se
# toca nunca: hay que revisarlo a mano.
if docker_cmd volume inspect nv_pgdata >/dev/null 2>&1; then
  fallo "Ya existe el volumen nv_pgdata (datos locales anteriores). No se continúa para no mezclarlos; pide ayuda."
fi

aviso "La tienda se detendrá unos 5–10 minutos mientras se pasa la base a este servidor."
aviso "La base externa no se borra: queda de respaldo."
read -r -p "  Escribe PASAR para continuar: " r </dev/tty
[[ "$r" == "PASAR" ]] || fallo "Cancelado."

paso "Deteniendo la tienda"
dc stop caddy web trabajador api
ok "Detenida"

paso "Copia de seguridad de la base externa (puede tardar unos minutos)"
dc exec -T respaldos respaldar || {
  dc up -d
  fallo "La copia falló; no se cambia nada. La tienda vuelve a arrancar."
}
copia="$(dc exec -T respaldos restaurar resolver ultima)"
ok "Copia lista: $copia"

paso "Cambiando la configuración a la base local"
cp -p "$ENTORNO" "$GUARDADO"
chmod 600 "$GUARDADO"

volver() {
  aviso "Algo falló. Vuelvo a la base externa (no se perdió nada)."
  cp -p "$GUARDADO" "$ENTORNO"
  dc stop postgres 2>/dev/null || true
  dc up -d --no-deps --force-recreate respaldos || true
  dc up -d || true
  aviso "La tienda sigue con la base externa. $GUARDADO se queda para revisar."
}
trap volver ERR

# Pone VAR=valor en .env.produccion (reemplaza la línea o la agrega al final).
poner() {
  local nombre="$1" contenido="$2" tmp
  tmp="$(mktemp "$RAIZ/.env.tmp.XXXXXX")"
  chmod 600 "$tmp"
  awk -v n="$nombre" -v v="$contenido" '
    BEGIN { hecho = 0 }
    index($0, n "=") == 1 { print n "=" v; hecho = 1; next }
    { print }
    END { if (!hecho) print n "=" v }
  ' "$ENTORNO" >"$tmp"
  cat "$tmp" >"$ENTORNO"
  rm -f "$tmp"
}

clave="$(openssl rand -hex 24)"
perfiles="$(valor COMPOSE_PROFILES)"
case ",$perfiles," in
  *,base-local,*) ;;
  ,,) perfiles="base-local" ;;
  *) perfiles="base-local,$perfiles" ;;
esac
poner BASE_HOST ""
poner BASE_PUERTO 5432
poner BASE_SSL prefer
poner BASE_AHORRO false
poner POSTGRES_USER nv
poner POSTGRES_DB nv
poner POSTGRES_PASSWORD "$clave"
poner DATABASE_URL "postgresql://nv:$clave@postgres:5432/nv"
poner COMPOSE_PROFILES "$perfiles"
# Supabase usa PostgreSQL 17: la base local usa la misma versión para restaurar sin problemas.
version="$(valor RESPALDO_PG_VERSION)"
poner BASE_LOCAL_PG_VERSION "${version:-17}"
unset clave
ok "Configuración cambiada (la anterior quedó en .env.produccion.externa)"

paso "Arrancando PostgreSQL en este servidor"
dc up -d postgres
esperar_sano postgres 180 || false
ok "PostgreSQL listo"

paso "Restaurando los datos en la base local"
dc up -d --no-deps --force-recreate respaldos
sleep 3
# Sin «-u root»: solo la base de datos; los comprobantes del disco no se tocan.
dc exec -T respaldos restaurar real "$copia"
ok "Datos restaurados"

paso "Arrancando la tienda"
dc up -d
esperar_sano api 300 || false
trap - ERR

ok "Listo: la base de datos ahora está en este servidor."
echo
echo "  Comprueba con:  bash infra/estado.sh"
echo "  Si quieres volver a la base externa:"
echo "    cp .env.produccion.externa .env.produccion && bash infra/actualizar.sh"
