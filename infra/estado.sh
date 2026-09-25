#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Resumen de salud de NV Streaming: servicios, web y API, certificado, trabajador,
# copias de seguridad, correos fallidos, disco y memoria.
#
#   bash infra/estado.sh           (completo)
#   bash infra/estado.sh --breve   (solo lo esencial)
# Termina con código 1 si algo importante está mal (sirve para automatizar avisos).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

breve=0
if [[ "${1:-}" == "--breve" ]]; then breve=1; fi
problemas=0
mal() {
  aviso "$*"
  problemas=$((problemas + 1))
}

dominio="$(valor DOMINIO)"
puerto="$(valor HTTPS_PUERTO)"
puerto="${puerto:-443}"
curl_opts=(-sS --max-time 15 --resolve "$dominio:$puerto:127.0.0.1")
if [[ "$(valor CADDY_TLS)" == "interno" ]]; then curl_opts+=(-k); fi
base="https://$dominio:$puerto"

paso "Servicios"
dc ps --format 'table {{.Service}}\t{{.Status}}'
for s in postgres api trabajador web caddy respaldos; do
  id="$(dc ps -q "$s" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    mal "$s no está en marcha"
    continue
  fi
  estado="$(docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
  [[ "$estado" == "healthy" || "$estado" == "running" ]] || mal "$s: $estado"
done

paso "Web y API (a través de Caddy, como un visitante)"
if salud="$(curl "${curl_opts[@]}" -f "$base/api/v1/salud" 2>&1)"; then
  ok "API: $salud"
else
  mal "La API no responde por HTTPS: $salud"
fi
codigo="$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code}' "$base/" 2>/dev/null || true)"
if [[ "$codigo" == "200" ]]; then ok "Portada: HTTP 200"; else mal "Portada: HTTP ${codigo:-sin respuesta}"; fi

if ((!breve)) && [[ "$(valor CADDY_TLS)" != "interno" ]]; then
  paso "Certificado HTTPS"
  if fin="$(echo | openssl s_client -connect "127.0.0.1:$puerto" -servername "$dominio" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)"; then
    fin="${fin#notAfter=}"
    dias=$((($(date -d "$fin" +%s) - $(date +%s)) / 86400))
    if ((dias < 14)); then mal "El certificado vence en $dias días ($fin)"; else ok "Vence en $dias días ($fin)"; fi
  else
    mal "No se pudo leer el certificado."
  fi
fi

paso "Trabajador (automatizaciones)"
latido="$(psql_nv -c "SELECT COALESCE(EXTRACT(EPOCH FROM now() - max(ultimo_latido_en))::int, -1) FROM latidos_trabajador" 2>/dev/null || echo -1)"
if [[ "$latido" =~ ^[0-9]+$ ]] && ((latido < 120)); then
  ok "Último latido hace ${latido}s"
else
  mal "El trabajador no da señales (${latido}s). Logs: docker compose ... logs trabajador"
fi
fallidos="$(psql_nv -c "SELECT count(*) FROM trabajos WHERE estado = 'fallido' AND creado_en > now() - interval '24 hours'" 2>/dev/null || echo '?')"
if [[ "$fallidos" == "0" ]]; then ok "Sin trabajos fallidos en 24 h"; else aviso "Trabajos fallidos en 24 h: $fallidos (panel → Automatizaciones)"; fi

paso "Copias de seguridad"
ultima="$(dc exec -T respaldos cat /respaldos/ULTIMA_COPIA_OK 2>/dev/null || true)"
if [[ -z "$ultima" ]]; then
  mal "Todavía no hay ninguna copia correcta. Haz una: bash infra/respaldar.sh"
else
  horas=$((($(date +%s) - $(date -d "$ultima" +%s)) / 3600))
  if ((horas > 26)); then mal "La última copia correcta es de hace ${horas} h ($ultima)"; else ok "Última copia correcta: hace ${horas} h"; fi
fi
if [[ -z "$(valor RESPALDO_REMOTO)" ]]; then aviso "Las copias solo están en este servidor (configura RESPALDO_REMOTO)."; fi

if ((!breve)); then
  paso "Correo"
  correos="$(psql_nv -c "SELECT count(*) FILTER (WHERE estado <> 'enviado'), count(*) FROM correos_salientes WHERE creado_en > now() - interval '24 hours'" 2>/dev/null || echo '?|?')"
  ok "Últimas 24 h: ${correos#*|} correos, ${correos%%|*} sin enviar"
  if [[ -z "$(valor SMTP_HOST)" ]]; then aviso "SMTP sin configurar: no salen correos (verificación de cuentas, avisos)."; fi

  paso "Servidor"
  uso_disco="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"
  if ((uso_disco > 85)); then mal "Disco al ${uso_disco}%"; else ok "Disco al ${uso_disco}% ($(df -h / | awk 'NR==2 {print $4}') libres)"; fi
  ok "Memoria: $(free -h | awk '/Mem:/ {print $3 " usados de " $2}')"
  docker_cmd stats --no-stream --format '      {{.Name}}: CPU {{.CPUPerc}}, memoria {{.MemUsage}}' | sort
fi

echo
if ((problemas == 0)); then
  ok "Todo en orden."
else
  fallo "$problemas problema(s). Mira arriba y docs/INSTALACION.md, «Problemas frecuentes»."
fi
