#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restaura copias de seguridad de NV Streaming.
#
#   bash infra/restaurar.sh listar               ver las copias (locales y remotas)
#   bash infra/restaurar.sh probar [copia]       PRUEBA en una base temporal: no toca nada.
#                                                Hazla una vez al mes (docs/OPERACION.md).
#   bash infra/restaurar.sh descargar <copia>    baja una copia del almacenamiento remoto
#   bash infra/restaurar.sh real <copia>         REEMPLAZA la base de datos y los comprobantes
#   bash infra/restaurar.sh entorno <copia>      muestra el .env.produccion guardado
#
# <copia> es el nombre (nv-AAAAMMDD-HHMMSS) o «ultima». Para «real», la tienda se
# detiene unos minutos y antes se hace una copia de lo que hay ahora.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

orden="${1:-}"
case "$orden" in
  listar | probar | descargar | entorno)
    dc exec -T respaldos restaurar "$@"
    ;;
  real)
    copia="${2:-}"
    [[ -n "$copia" ]] || fallo "Indica la copia: bash infra/restaurar.sh real nv-AAAAMMDD-HHMMSS (o «ultima»)."
    # Se resuelve (y se verifica) ANTES de la copia de seguridad previa, que pasará a ser la última.
    copia="$(dc exec -T respaldos restaurar resolver "$copia")" || fallo "No se encontró esa copia."
    aviso "Esto REEMPLAZA todos los datos actuales por los de la copia «$copia»."
    aviso "Los pedidos, pagos y cambios posteriores a esa copia se perderán."
    read -r -p "  Escribe RESTAURAR para continuar: " r </dev/tty
    [[ "$r" == "RESTAURAR" ]] || fallo "Cancelado."

    paso "Copia de seguridad de lo que hay ahora (por si acaso)"
    dc exec -T respaldos respaldar || fallo "No se pudo hacer la copia previa; no se restaura."

    paso "Deteniendo la tienda"
    dc stop caddy web trabajador api
    paso "Restaurando"
    if ! dc exec -T -u root respaldos restaurar real "$copia"; then
      aviso "La restauración falló. Arranco la tienda de nuevo; revisa el mensaje de arriba."
      dc up -d
      exit 1
    fi
    paso "Arrancando la tienda"
    dc up -d
    esperar_sano api 300 || fallo "La API no quedó sana tras restaurar. Revisa: bash infra/estado.sh"
    ok "Restauración terminada."
    ;;
  *)
    sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
