#!/usr/bin/env bash
# Programador del servicio «respaldos»: hace una copia de seguridad a las horas de
# RESPALDO_HORAS (hora de Venezuela, formato HH:MM separado por espacios; por defecto
# «03:30»). Es un cron mínimo que no necesita privilegios de root.
set -euo pipefail

HORAS="${RESPALDO_HORAS:-03:30}"
for h in $HORAS; do
  if [[ ! "$h" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "RESPALDO_HORAS tiene un valor no válido: «$h» (usa HH:MM, p. ej. 03:30)." >&2
    exit 1
  fi
done
echo "Programador de copias listo. Horas (${TZ:-UTC}): $HORAS"

ultima=""
while true; do
  ahora="$(date +%H:%M)"
  hoy="$(date +%F)"
  for h in $HORAS; do
    if [[ "$ahora" == "$h" && "$ultima" != "$hoy $h" ]]; then
      ultima="$hoy $h"
      # Un fallo no detiene el programador: se registra y se reintenta en la próxima hora.
      respaldar || echo "$(date '+%F %T') La copia de seguridad falló (ver arriba)." >&2
    fi
  done
  sleep 20
done
