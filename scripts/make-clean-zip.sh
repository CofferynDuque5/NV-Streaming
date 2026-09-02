#!/usr/bin/env bash
#
# make-clean-zip.sh — Empaqueta el repositorio LIMPIO en un ZIP listo para subir.
#
# Usa `git archive`, que respeta .gitignore automáticamente: el ZIP NUNCA
# incluye node_modules/, dist/, build/, .env ni logs — solo el código fuente
# versionado. Es la forma más fiable de exportar un repo limpio.
#
# Uso:
#   bash scripts/make-clean-zip.sh                 # → nv-streaming-<fecha>.zip
#   bash scripts/make-clean-zip.sh mi-nombre.zip    # nombre de salida a medida
#   REF=main bash scripts/make-clean-zip.sh          # empaqueta otra rama/tag
#
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

REF="${REF:-HEAD}"
OUT="${1:-nv-streaming-$(date +%Y%m%d).zip}"
PREFIX="nv-streaming/"   # carpeta raíz dentro del ZIP

if git rev-parse --verify "$REF" >/dev/null 2>&1; then
  # Camino ideal: solo ficheros versionados y limpios (ignora .gitignore).
  git archive --format=zip --prefix="$PREFIX" -o "$OUT" "$REF"
else
  # Respaldo sin git: zip excluyendo lo pesado/sensible.
  command -v zip >/dev/null || { echo "Instala 'zip' o usa git." >&2; exit 1; }
  zip -r "$OUT" . \
    -x '*/node_modules/*' 'node_modules/*' \
       '*/dist/*' 'dist/*' '*/build/*' 'build/*' \
       '*/.git/*' '.git/*' '*.log' \
       '**/.env' '.env' '*/.run/*' '.run/*' >/dev/null
fi

SIZE="$(du -h "$OUT" | cut -f1)"
printf '\n✓ ZIP limpio creado: %s (%s)\n' "$OUT" "$SIZE"
printf '  Contenido (respeta .gitignore): sin node_modules, dist, .env ni logs.\n'
printf '  Verifica con:  unzip -l "%s" | head\n' "$OUT"
