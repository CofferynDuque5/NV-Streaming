#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Instalador de NV Streaming para un servidor Ubuntu 24.04 recién creado
# (pensado para la VM ARM «Always Free» de Oracle Cloud; sirve en cualquier Ubuntu).
#
#   git clone https://github.com/CofferynDuque5/NV-Streaming.git ~/nv-streaming
#   cd ~/nv-streaming && bash infra/instalar.sh
#
# Se puede ejecutar varias veces sin romper nada: lo que ya está hecho se salta, y
# .env.produccion (con las claves) NUNCA se vuelve a generar.
#
# Qué hace, en orden:
#   1. Instala Docker (repositorio oficial), git, openssl y utilidades.
#   2. Abre los puertos 80 y 443 en el cortafuegos del servidor (22 ya está abierto).
#   3. Crea memoria de intercambio (swap) si el servidor tiene poca RAM.
#   4. Actualiza el código (git pull) si ya estaba clonado.
#   5. Te pregunta dominio, correo y SMTP y genera .env.produccion con claves aleatorias.
#   6. Compila las imágenes, arranca todo y aplica las migraciones de la base.
#   7. Crea la primera cuenta de administración (enlace de invitación + 2FA obligatorio).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
# shellcheck source=infra/comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

# ── 0. Comprobaciones ───────────────────────────────────────────────────────
paso "Comprobando el servidor"
[[ -r /etc/os-release ]] || fallo "No se reconoce el sistema operativo."
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || fallo "Este instalador es para Ubuntu (encontrado: ${PRETTY_NAME:-desconocido})."
[[ "${VERSION_ID:-}" == "24.04" ]] || aviso "Probado en Ubuntu 24.04; tienes ${VERSION_ID:-?}. Continúo."
if [[ ${#SUDO[@]} -gt 0 ]]; then
  sudo -v || fallo "Necesitas permisos de sudo."
fi
ok "$PRETTY_NAME, arquitectura $(uname -m), $(nproc) núcleos, $(awk '/MemTotal/{printf "%.1f", $2/1048576}' /proc/meminfo) GB de RAM"

# ── 1. Paquetes y Docker ────────────────────────────────────────────────────
paso "Instalando paquetes básicos"
export DEBIAN_FRONTEND=noninteractive
"${SUDO[@]}" apt-get update -qq
"${SUDO[@]}" apt-get install -y -qq ca-certificates curl git openssl gnupg dnsutils >/dev/null
ok "curl, git, openssl, gnupg y dnsutils listos"

paso "Instalando Docker (repositorio oficial de Docker)"
if command -v docker >/dev/null && docker_cmd compose version >/dev/null 2>&1; then
  ok "Docker ya estaba instalado: $(docker_cmd --version)"
else
  "${SUDO[@]}" install -m 0755 -d /etc/apt/keyrings
  "${SUDO[@]}" curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  "${SUDO[@]}" chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" |
    "${SUDO[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null
  "${SUDO[@]}" apt-get update -qq
  "${SUDO[@]}" apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  ok "Instalado: $(docker_cmd --version)"
fi
# Rotación de logs por defecto para cualquier contenedor (los de NV ya la traen).
if [[ ! -f /etc/docker/daemon.json ]]; then
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' |
    "${SUDO[@]}" tee /etc/docker/daemon.json >/dev/null
  "${SUDO[@]}" systemctl restart docker
fi
"${SUDO[@]}" systemctl enable --now docker >/dev/null 2>&1
if [[ "$(id -u)" -ne 0 ]] && ! id -nG | grep -qw docker; then
  "${SUDO[@]}" usermod -aG docker "$USER"
  aviso "Te añadí al grupo «docker». Hasta que vuelvas a entrar por SSH, los scripts usarán sudo."
fi

# ── 2. Cortafuegos ──────────────────────────────────────────────────────────
paso "Abriendo los puertos 80 y 443 en el servidor"
if [[ -f /etc/iptables/rules.v4 ]] && grep -q 'InstanceServices' /etc/iptables/rules.v4; then
  # Imagen de Oracle Cloud: trae reglas de iptables propias y Oracle desaconseja ufw
  # (puede impedir que la VM arranque). Se añaden reglas antes del REJECT final.
  for puerto in 80 443; do
    if ! "${SUDO[@]}" iptables -C INPUT -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT 2>/dev/null; then
      linea="$("${SUDO[@]}" iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')"
      "${SUDO[@]}" iptables -I INPUT "${linea:-1}" -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT
    fi
  done
  "${SUDO[@]}" apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
  "${SUDO[@]}" netfilter-persistent save >/dev/null
  ok "Reglas de iptables guardadas (Oracle Cloud). Recuerda abrirlos también en la «Security List» de Oracle."
else
  "${SUDO[@]}" apt-get install -y -qq ufw >/dev/null
  "${SUDO[@]}" ufw allow OpenSSH >/dev/null
  "${SUDO[@]}" ufw allow 80/tcp >/dev/null
  "${SUDO[@]}" ufw allow 443/tcp >/dev/null
  "${SUDO[@]}" ufw --force enable >/dev/null
  ok "ufw activo: 22, 80 y 443 abiertos"
fi

# ── 3. Memoria de intercambio ───────────────────────────────────────────────
paso "Revisando la memoria"
ram_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
swap_mb="$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo)"
if ((ram_mb < 8000 && swap_mb < 1000)); then
  "${SUDO[@]}" fallocate -l 4G /swapfile
  "${SUDO[@]}" chmod 600 /swapfile
  "${SUDO[@]}" mkswap /swapfile >/dev/null
  "${SUDO[@]}" swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | "${SUDO[@]}" tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | "${SUDO[@]}" tee /etc/sysctl.d/99-nv-swap.conf >/dev/null
  "${SUDO[@]}" sysctl -q -p /etc/sysctl.d/99-nv-swap.conf
  ok "Creado un swap de 4 GB (el servidor tiene ${ram_mb} MB de RAM)"
else
  ok "RAM: ${ram_mb} MB, swap: ${swap_mb} MB. No hace falta más."
fi

# ── 4. Código ───────────────────────────────────────────────────────────────
paso "Actualizando el código"
if git -C "$RAIZ" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git -C "$RAIZ" pull --ff-only
  ok "Código al día ($(git -C "$RAIZ" log -1 --format='%h %s'))"
else
  aviso "La carpeta no sigue una rama remota; se usa el código tal como está."
fi

# ── 5. Configuración ────────────────────────────────────────────────────────
paso "Configuración (.env.produccion)"
if [[ -f "$ENTORNO" ]]; then
  ok "Ya existe: se conserva (con sus claves)."
else
  echo "  Responde unas preguntas. Todo se puede cambiar después en .env.produccion."
  NV_DOMINIO="${NV_DOMINIO:-$(preguntar 'Dominio de la tienda, sin https (p. ej. nvstreaming.com)')}"
  NV_CORREO_ADMIN="${NV_CORREO_ADMIN:-$(preguntar 'Tu correo (avisos del certificado y cuenta de administración)')}"
  if [[ -z "${NV_SMTP_HOST:-}" ]] && confirmar '¿Configuras ahora el correo saliente (SMTP)? Puedes hacerlo después'; then
    NV_SMTP_HOST="$(preguntar 'Servidor SMTP (p. ej. smtp-relay.brevo.com)')"
    NV_SMTP_PUERTO="$(preguntar 'Puerto' 587)"
    NV_SMTP_USUARIO="$(preguntar 'Usuario SMTP')"
    NV_SMTP_CONTRASENA="$(preguntar_secreto 'Contraseña o clave SMTP (no se muestra)')"
    NV_CORREO_REMITENTE="$(preguntar 'Remitente' "NV Streaming <no-responder@$NV_DOMINIO>")"
    if [[ "$NV_SMTP_PUERTO" == "465" ]]; then NV_SMTP_SEGURO=true; fi
  fi
  export NV_DOMINIO NV_CORREO_ADMIN NV_SMTP_HOST NV_SMTP_PUERTO NV_SMTP_SEGURO NV_SMTP_USUARIO \
    NV_SMTP_CONTRASENA NV_CORREO_REMITENTE
  bash "$RAIZ/infra/generar-entorno.sh" "$ENTORNO"
  echo
  aviso "IMPORTANTE: copia AHORA estas dos claves a tu gestor de contraseñas (p. ej. Bitwarden)."
  aviso "Sin ellas no podrás recuperar los datos si pierdes el servidor:"
  echo "      CLAVE_CIFRADO=$(valor CLAVE_CIFRADO)"
  echo "      RESPALDO_CLAVE=$(valor RESPALDO_CLAVE)"
  [[ -n "${NV_NO_INTERACTIVO:-}" ]] || read -r -p "  Pulsa Enter cuando las hayas guardado… " _ </dev/tty
fi
chmod 600 "$ENTORNO"
dir_respaldos="$(valor RESPALDO_DIR_SERVIDOR)"
dir_respaldos="${dir_respaldos:-/var/backups/nv-streaming}"
# El servicio de copias corre con tu mismo usuario (NV_UID/NV_GID): solo tú las lees.
uid_copias="$(valor NV_UID)"
gid_copias="$(valor NV_GID)"
"${SUDO[@]}" install -d -m 700 -o "${uid_copias:-$(id -u)}" -g "${gid_copias:-$(id -g)}" "$dir_respaldos"
ok "Copias de seguridad en $dir_respaldos"

dominio="$(valor DOMINIO)"
ip_publica="$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || true)"
ip_dns="$(dig +short A "$dominio" | tail -n 1 || true)"
if [[ -n "$ip_publica" && "$ip_dns" != "$ip_publica" ]]; then
  aviso "$dominio apunta a «${ip_dns:-nada}» y este servidor es $ip_publica."
  aviso "Si ya activaste el proxy de Cloudflare (nube naranja) es normal; si no, revisa el DNS"
  aviso "(docs/INSTALACION.md, paso 3). Sin DNS correcto no habrá certificado HTTPS."
fi

# ── 6. Compilar y arrancar ──────────────────────────────────────────────────
paso "Compilando las imágenes (la primera vez tarda de 5 a 15 minutos)"
dc build
ok "Imágenes listas"

paso "Arrancando NV Streaming (migraciones incluidas)"
dc up -d --remove-orphans
esperar_sano api 300 || fallo "La API no arrancó. Mira: docker compose -f docker-compose.prod.yml --env-file .env.produccion logs api migrar"
esperar_sano web 180 || fallo "La web no arrancó. Mira los logs del servicio web."
ok "API y web en marcha"

# ── 7. Primera cuenta de administración ─────────────────────────────────────
paso "Cuenta de administración"
admins="$(psql_nv -c "SELECT count(*) FROM usuarios WHERE rol = 'admin'")"
if [[ "${admins:-0}" -gt 0 ]]; then
  ok "Ya hay $admins cuenta(s) de administración. Para otra: infra/crear-admin.sh"
else
  correo_admin="${NV_ADMIN_CORREO:-$(valor CORREO_ADMIN)}"
  nombre_admin="${NV_ADMIN_NOMBRE:-$(preguntar 'Tu nombre para la cuenta de administración' 'Administración')}"
  bash "$RAIZ/infra/crear-admin.sh" "$correo_admin" "$nombre_admin"
fi

paso "¡Listo!"
cat <<EOF
  Tienda:           $(valor WEB_ORIGEN)
  Estado:           bash infra/estado.sh
  Actualizar:       bash infra/actualizar.sh
  Copia manual:     bash infra/respaldar.sh
  Monitor (Kuma):   ssh -L 3001:127.0.0.1:3001 $USER@${ip_publica:-IP-DEL-SERVIDOR}  →  http://localhost:3001

  Siguientes pasos: docs/INSTALACION.md, desde «Primer ingreso y 2FA».
EOF
