#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Genera .env.produccion con claves aleatorias fuertes (openssl). Lo usa instalar.sh;
# también sirve sin preguntas (CI o pruebas) con variables NV_*:
#
#   NV_DOMINIO=tienda.com NV_CORREO_ADMIN=yo@correo.com infra/generar-entorno.sh [archivo]
#
# Opcionales: NV_WEB_ORIGEN (por defecto https://NV_DOMINIO), NV_CADDY_TLS (acme),
#   NV_SMTP_HOST, NV_SMTP_PUERTO (587), NV_SMTP_SEGURO (false), NV_SMTP_USUARIO,
#   NV_SMTP_CONTRASENA, NV_CORREO_REMITENTE, NV_RESPALDO_DIR (/var/backups/nv-streaming).
# NUNCA sobrescribe un archivo existente: las claves de la base de datos y de cifrado
# no se pueden cambiar sin perder datos.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

destino="${1:-$ENTORNO}"
[[ -e "$destino" ]] && fallo "$destino ya existe; no se sobrescribe (guarda sus claves)."
command -v openssl >/dev/null || fallo "Falta openssl."

dominio="${NV_DOMINIO:?Falta NV_DOMINIO}"
correo_admin="${NV_CORREO_ADMIN:?Falta NV_CORREO_ADMIN}"
[[ "$dominio" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || fallo "Dominio no válido: $dominio"
[[ "$correo_admin" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fallo "Correo no válido: $correo_admin"
web_origen="${NV_WEB_ORIGEN:-https://$dominio}"
smtp_host="${NV_SMTP_HOST:-}"
remitente="${NV_CORREO_REMITENTE:-NV Streaming <no-responder@$dominio>}"

# Valores escritos por la persona: entre comillas simples (Docker los toma literales).
literal() {
  [[ "$1" != *"'"* ]] || fallo "Los valores no pueden contener comillas simples (')."
  printf "'%s'" "$1"
}

pg_clave="$(openssl rand -hex 24)"
umask 077
cat >"$destino" <<EOF
# ─────────────────────────────────────────────────────────────────────────────
# NV Streaming — configuración de PRODUCCIÓN. Generado el $(date '+%F %T').
# ¡SECRETO! No lo subas a git ni lo compartas. Guarda una copia en tu gestor de
# contraseñas: CLAVE_CIFRADO y RESPALDO_CLAVE son imprescindibles para recuperar datos.
# Tras cambiar algo: infra/actualizar.sh (o «docker compose ... up -d»).
# Referencia de todas las variables: .env.example
# ─────────────────────────────────────────────────────────────────────────────

# ── Dominio y certificado ───────────────────────────────────────────────────
DOMINIO=$dominio
# Correo para Let's Encrypt (avisos de certificados).
CORREO_ADMIN=$correo_admin
# acme (Let's Encrypt, recomendado) | origen (certificado de origen de Cloudflare) | interno (pruebas)
CADDY_TLS=${NV_CADDY_TLS:-acme}
WEB_ORIGEN=$web_origen
# Vacía = WEB_ORIGEN (Caddy envía /api a la API). URL de los webhooks de las pasarelas.
API_URL_PUBLICA=

# ── Base de datos (PostgreSQL en el contenedor «postgres», no expuesto) ────
POSTGRES_USER=nv
POSTGRES_DB=nv
POSTGRES_PASSWORD=$pg_clave
DATABASE_URL=postgresql://nv:$pg_clave@postgres:5432/nv

# ── Seguridad ───────────────────────────────────────────────────────────────
# Clave AES-256 de los datos cifrados (2FA, tokens de pasarelas). NO la cambies nunca.
CLAVE_CIFRADO=$(openssl rand -base64 32)
# Saltos de proxy delante de la API: Caddy y la web (Caddy fija la IP real del visitante).
PROXIES_DE_CONFIANZA=2
# Documentación de la API en /api/docs (desactivada en producción).
DOCS_API_HABILITADA=false
SESION_DURACION_HORAS=12
SESION_INACTIVIDAD_MINUTOS=120
COMPROBANTE_MAX_MB=5

# ── Correo (obligatorio en producción para verificar cuentas y enviar avisos) ─
CORREO_PROVEEDOR=smtp
CORREO_REMITENTE=$(literal "$remitente")
SMTP_HOST=$(literal "$smtp_host")
SMTP_PUERTO=${NV_SMTP_PUERTO:-587}
SMTP_SEGURO=${NV_SMTP_SEGURO:-false}
SMTP_USUARIO=$(literal "${NV_SMTP_USUARIO:-}")
SMTP_CONTRASENA=$(literal "${NV_SMTP_CONTRASENA:-}")

# ── Automatizaciones ────────────────────────────────────────────────────────
VENCIMIENTOS_CADA_MINUTOS=10
VENCIMIENTOS_EN_API=false

# ── WhatsApp (opcional; ver README, «Automatizaciones y trabajador») ────────
WHATSAPP_PROVEEDOR=desactivado
WHATSAPP_TOKEN=
WHATSAPP_TELEFONO_ID=
WHATSAPP_IDIOMA=es

# ── Pagos en línea (opcional; ver README, «Pagos en línea») ─────────────────
PASARELA_SANDBOX_HABILITADA=false
PAYPAL_CLIENTE_ID=
PAYPAL_SECRETO=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODO=produccion
MERCADOPAGO_TOKEN_ACCESO=
MERCADOPAGO_SECRETO_WEBHOOK=
MERCADOPAGO_MODO=produccion
MERCADOPAGO_MONEDA=

# ── Asistente de IA (opcional; ver docs/INSTALACION.md) ─────────────────────
ASISTENTE_SANDBOX_HABILITADO=false
# Motor local: pon COMPOSE_PROFILES=ia y OLLAMA_URL=http://ollama:11434
COMPOSE_PROFILES=
OLLAMA_URL=
OLLAMA_MODELO=qwen2.5:7b-instruct
# Cloudflare corta las respuestas a los 100 s: no subas de 90.
OLLAMA_TIEMPO_LIMITE_S=90
ANTHROPIC_API_KEY=
ANTHROPIC_MODELO=
ANTHROPIC_PRECIO_ENTRADA_MTOK=
ANTHROPIC_PRECIO_SALIDA_MTOK=

# ── Copias de seguridad (servicio «respaldos») ──────────────────────────────
# Clave con la que se cifran las copias. Sin ella NO se pueden restaurar: guárdala fuera.
RESPALDO_CLAVE=$(openssl rand -hex 32)
# Horas de Venezuela (HH:MM, separadas por espacios).
RESPALDO_HORAS=03:30
RESPALDO_COPIAS_LOCALES=7
RESPALDO_DIR_SERVIDOR=${NV_RESPALDO_DIR:-/var/backups/nv-streaming}
# Usuario del servidor con el que corre el servicio de copias (dueño de este archivo).
NV_UID=${NV_UID:-$(id -u)}
NV_GID=${NV_GID:-$(id -g)}
# Copia fuera del servidor con rclone (vacío = solo local). Ver docs/INSTALACION.md.
RESPALDO_REMOTO=
RESPALDO_DIAS_REMOTO=30
# URL «push» de Uptime Kuma para avisarte si una noche no hubo copia.
RESPALDO_URL_AVISO=
# Oracle Object Storage (API compatible con S3). Rellena y pon RESPALDO_REMOTO=oci:nv-respaldos
RCLONE_CONFIG_OCI_TYPE=s3
RCLONE_CONFIG_OCI_PROVIDER=Other
RCLONE_CONFIG_OCI_ENDPOINT=
RCLONE_CONFIG_OCI_REGION=
RCLONE_CONFIG_OCI_ACCESS_KEY_ID=
RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY=
RCLONE_CONFIG_OCI_FORCE_PATH_STYLE=true
RCLONE_CONFIG_OCI_NO_CHECK_BUCKET=true
EOF
ok "Creado $destino con claves nuevas."
