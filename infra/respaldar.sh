#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Hace una copia de seguridad AHORA (además de la automática de cada noche).
#
#   bash infra/respaldar.sh
#
# La copia (base de datos, comprobantes y configuración, todo cifrado con
# RESPALDO_CLAVE) queda en RESPALDO_DIR_SERVIDOR y, si configuraste RESPALDO_REMOTO,
# también en el almacenamiento de objetos. Lo hace el servicio «respaldos»
# (infra/respaldos/respaldar.sh).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

dc exec -T respaldos respaldar
dc exec -T respaldos restaurar listar
