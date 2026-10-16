#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Crea una cuenta de administración (o renueva su invitación si aún no la aceptó).
#
#   bash infra/crear-admin.sh tu@correo.com "Tu nombre"
#
# Imprime un enlace de un solo uso (vence en 72 h) para que esa persona elija su
# contraseña. Al entrar, la web le obliga a configurar la verificación en dos pasos.
# No usa datos de demostración ni contraseñas fijas.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
requiere_entorno

correo="${1:-}"
nombre="${2:-}"
[[ -n "$correo" ]] || correo="$(preguntar 'Correo de la cuenta de administración')"
[[ -n "$nombre" ]] || nombre="$(preguntar 'Nombre' 'Administración')"

dc run --rm --no-deps migrar ./node_modules/.bin/tsx scripts/crear-admin.ts \
  --correo "$correo" --nombre "$nombre"
