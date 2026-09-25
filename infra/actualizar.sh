#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Actualiza NV Streaming a la última versión del repositorio.
#
#   bash infra/actualizar.sh               (con copia de seguridad previa)
#   bash infra/actualizar.sh --sin-copia   (sin copia previa; no recomendado)
#
# 1. Descarga el código nuevo (git pull).
# 2. Hace una copia de seguridad por si hay que volver atrás.
# 3. Compila las imágenes nuevas MIENTRAS la versión actual sigue atendiendo.
# 4. Aplica las migraciones de la base de datos.
# 5. Reinicia solo los servicios que cambiaron. Caddy retiene las peticiones unos
#    segundos mientras tanto, así que los visitantes casi no lo notan.
# También sirve para aplicar cambios de .env.produccion (sin código nuevo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

copia=1
if [[ "${1:-}" == "--sin-copia" ]]; then copia=0; fi

paso "Descargando la última versión"
antes="$(git -C "$RAIZ" rev-parse --short HEAD)"
if git -C "$RAIZ" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git -C "$RAIZ" pull --ff-only || fallo "No se pudo actualizar el código (¿cambiaste archivos a mano? mira «git status»)."
else
  aviso "La carpeta no sigue una rama remota; se usa el código tal como está."
fi
despues="$(git -C "$RAIZ" rev-parse --short HEAD)"
if [[ "$antes" == "$despues" ]]; then
  ok "Sin código nuevo ($despues). Se aplican igualmente la configuración y las imágenes."
else
  ok "De $antes a $despues:"
  git -C "$RAIZ" log --oneline "$antes..$despues" | head -n 20 | sed 's/^/      /'
fi

if ((copia)) && [[ -n "$(dc ps -q postgres 2>/dev/null)" ]]; then
  paso "Copia de seguridad previa"
  dc exec -T respaldos respaldar || fallo "La copia previa falló; no se actualiza. Revisa: bash infra/estado.sh"
fi

paso "Compilando las imágenes nuevas (la tienda sigue funcionando)"
dc build --pull
dc pull --ignore-buildable --quiet
ok "Imágenes listas"

paso "Aplicando migraciones de la base de datos"
dc up -d postgres
esperar_sano postgres 120 || fallo "PostgreSQL no responde."
dc run --rm migrar || fallo "Las migraciones fallaron: la versión anterior sigue en marcha. Revisa el mensaje de arriba."
ok "Base de datos al día"

paso "Reiniciando los servicios que cambiaron"
dc up -d --remove-orphans
esperar_sano api 300 || fallo "La API no quedó sana. Logs: docker compose -f docker-compose.prod.yml --env-file .env.produccion logs --tail=100 api"
esperar_sano web 180 || fallo "La web no quedó sana. Revisa sus logs."
ok "NV Streaming actualizado a $despues"

paso "Limpiando imágenes antiguas"
docker_cmd image prune -f >/dev/null
ok "Hecho"
bash "$RAIZ/infra/estado.sh" --breve || true
