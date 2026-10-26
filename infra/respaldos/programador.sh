#!/usr/bin/env bash
# Programador del servicio «respaldos»: hace una copia de seguridad a las horas de
# RESPALDO_HORAS (hora de Venezuela, formato HH:MM separado por espacios; por defecto
# «03:30»). Es un cron mínimo que no necesita privilegios de root.
#
# Además, una vez por semana (RESPALDO_PRUEBA_DIA: 1 = lunes … 7 = domingo, por
# defecto 7; «no» la desactiva), tras la primera copia de ese día hace una PRUEBA de
# restauración en una base temporal (restaurar probar) y deja la fecha en
# ULTIMA_PRUEBA_OK si salió bien. infra/estado.sh la muestra.
set -euo pipefail

HORAS="${RESPALDO_HORAS:-03:30}"
for h in $HORAS; do
  if [[ ! "$h" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "RESPALDO_HORAS tiene un valor no válido: «$h» (usa HH:MM, p. ej. 03:30)." >&2
    exit 1
  fi
done
DIA_PRUEBA="${RESPALDO_PRUEBA_DIA:-7}"
if [[ ! "$DIA_PRUEBA" =~ ^([1-7]|no)$ ]]; then
  echo "RESPALDO_PRUEBA_DIA tiene un valor no válido: «$DIA_PRUEBA» (1 = lunes … 7 = domingo, o «no»)." >&2
  exit 1
fi
DESTINO="${RESPALDO_DIR:-/respaldos}"
echo "Programador de copias listo. Horas (${TZ:-UTC}): $HORAS. Prueba de restauración: día ${DIA_PRUEBA}."

# Prueba de restauración semanal: no toca la base en uso; si falla, queda en el registro
# y ULTIMA_PRUEBA_OK no avanza (estado.sh avisa cuando pasan más de 8 días).
probar_restauracion() {
  if restaurar probar ultima; then
    date -Iseconds >"$DESTINO/ULTIMA_PRUEBA_OK"
  else
    echo "$(date '+%F %T') La prueba semanal de restauración FALLÓ (ver arriba)." >&2
  fi
}

ultima=""
probada=""
while true; do
  ahora="$(date +%H:%M)"
  hoy="$(date +%F)"
  for h in $HORAS; do
    if [[ "$ahora" == "$h" && "$ultima" != "$hoy $h" ]]; then
      ultima="$hoy $h"
      # Un fallo no detiene el programador: se registra y se reintenta en la próxima hora.
      if respaldar; then
        if [[ "$(date +%u)" == "$DIA_PRUEBA" && "$probada" != "$hoy" ]]; then
          probada="$hoy"
          probar_restauracion
        fi
      else
        echo "$(date '+%F %T') La copia de seguridad falló (ver arriba)." >&2
      fi
    fi
  done
  sleep 20
done
