# 🚀 Guía de Despliegue — NV Streaming

Esta guía te lleva de cero a producción en **cualquier proveedor** (VPS, Docker,
Render, Railway, AWS, etc.). El proyecto tiene **dos piezas**:

| Pieza | Carpeta | Qué es | Cómo se despliega |
|---|---|---|---|
| **Backend / API** | `whatsapp-agent/` | Node 20 + Express + PostgreSQL | Servidor Node persistente (VPS, Docker, Render, Railway…) |
| **Frontend** | `site/` | Web estática (HTML/JS/CSS) | Cualquier hosting estático (Vercel, Netlify, Nginx, S3…) |

> El backend **necesita una base de datos PostgreSQL**. El frontend solo necesita
> que apuntes su `config.js` a la URL pública del backend.

---

## ⚡ Comando único de arranque

Desde la raíz del repo, en el servidor:

```bash
bash setup.sh --seed
```

Eso, de una sola vez: verifica Node, crea el `.env` (y **genera secretos fuertes**),
instala dependencias, compila, migra la base de datos, siembra el catálogo real +
admin, y **arranca la API en producción**.

Variantes: `bash setup.sh` (sin sembrar), `--build-only` (solo compilar, para CI/Docker),
`--dev` (desarrollo con recarga). Equivalente multiplataforma (Windows incluido):
`node start.js --seed`.

---

## 🔧 Variables de entorno

Se configuran en `whatsapp-agent/.env` (local) **o** en el panel de tu hosting.
`setup.sh` crea el archivo desde `whatsapp-agent/.env.example` y genera
`JWT_SECRET` y `CREDENTIALS_ENC_KEY` si están vacíos.

### Obligatorias

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | `postgres://user:pass@host:5432/nv_streaming` |
| `JWT_SECRET` | Secreto para firmar sesiones (**≥ 32 chars**) | *(genéralo: `openssl rand -base64 48`)* |
| `NODE_ENV` | Entorno | `production` |
| `PORT` | Puerto de escucha (el host suele inyectarlo) | `3000` |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificación del webhook | *(el que inventes)* |
| `WHATSAPP_APP_SECRET` | Secreto de la app de Meta (valida firmas) | *(de Meta)* |

### Recomendadas / según funciones que actives

| Variable | Para qué |
|---|---|
| `CORS_ORIGIN` | **Restringe** el CORS a tu dominio de frontend (coma-separado). Sin esto, `*`. |
| `CREDENTIALS_ENC_KEY` | Cifrado AES-256 de credenciales en reposo (32 bytes base64/hex). Obligatoria en prod. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Admin inicial que crea `npm run seed`. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Asistente IA (opcional). |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | Correos de bienvenida/factura. |
| `BINANCE_PAY_KEY` `BINANCE_PAY_SECRET` `PAGO_MOVIL_WEBHOOK_SECRET` | Pasarela de pago (webhooks PSP). |
| `TELEGRAM_WEBHOOK_SECRET` `WHATSAPP_OTP_TOKEN` `TELEGRAM_BOT_TOKEN` | Módulo OTP. |
| `CRON_ENABLED` (`on`/`off`) | Tareas programadas (avisos de vencimiento, renovaciones). |

> La lista completa (49 variables, todas con valores por defecto seguros salvo las
> obligatorias) está documentada en `whatsapp-agent/.env.example`.

---

## Opción A — VPS (Ubuntu/Debian, DigitalOcean, EC2…)

```bash
# 1) Requisitos: Node 20+ y PostgreSQL (o una BD gestionada).
#    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs

# 2) Clona/sube el repo y entra.
cd nv-streaming

# 3) Define la BD (o usa una gestionada) y arranca.
export DATABASE_URL="postgres://usuario:clave@localhost:5432/nv_streaming"
bash setup.sh --seed
```

Para mantenerlo vivo tras cerrar sesión, usa **pm2** o un servicio systemd:

```bash
npm i -g pm2
cd whatsapp-agent && pm2 start dist/index.js --name nv-api && pm2 save && pm2 startup
```

## Opción B — Docker / docker-compose (portable a cualquier nube)

Levanta **todo el stack** (PostgreSQL + backend + frontend Nginx) sin instalar nada:

```bash
docker compose up -d --build
#   Frontend → http://localhost:8090
#   Backend  → http://localhost:3000/health
# Siembra inicial (una vez):
docker compose run --rm backend npm run seed
```

La imagen del backend (`whatsapp-agent/Dockerfile`) es **multi-etapa de producción**:
compila con las devDependencies y la imagen final solo lleva el JS + deps de prod,
corre como usuario sin privilegios y trae healthcheck.

## Opción C — Render (blueprint incluido)

1. **New → Blueprint**, conecta este repositorio.
2. Render lee `render.yaml`: crea la base de datos y el servicio web, **genera
   `JWT_SECRET` y `CREDENTIALS_ENC_KEY`** y cablea `DATABASE_URL` automáticamente.
3. Rellena en el panel las marcadas `sync: false` (`WHATSAPP_*`, `CORS_ORIGIN`).
4. Tras el primer deploy, en la *Shell* del servicio: `npm run seed`.

## Opción D — Railway / Heroku / Dokku

Usa el `Procfile` de `whatsapp-agent/` (`release:` migra, `web:` arranca). Fija el
*root directory* del servicio en `whatsapp-agent` y añade un PostgreSQL gestionado
(inyecta `DATABASE_URL`).

## Frontend en Vercel / Netlify (estático)

El backend **no** encaja en funciones serverless (usa cron + pool de PostgreSQL
persistente): despliégalo con las opciones A–D. El **frontend sí** es ideal para
Vercel/Netlify:

1. Publica la carpeta `site/` como sitio estático (sin build; *output dir* = `site`).
2. Apunta el frontend al backend editando `site/js/config.js`:
   ```js
   api: { base: "https://TU-BACKEND.onrender.com", /* … */ }
   ```
3. En el backend, pon `CORS_ORIGIN=https://TU-FRONTEND.vercel.app` para permitir
   solo tu dominio.

---

## 📦 Exportar el repositorio LIMPIO en un ZIP

Genera un ZIP sin `node_modules/`, `dist/`, `.env` ni logs (respeta `.gitignore`):

```bash
bash scripts/make-clean-zip.sh
#   → nv-streaming-<fecha>.zip
# Verifica el contenido:
unzip -l nv-streaming-*.zip | head
```

Usa `git archive` internamente, así que el ZIP contiene **solo** el código fuente
versionado. En el servidor de destino: descomprime, `cd nv-streaming` y
`bash setup.sh --seed`.

---

## ✅ Post-despliegue (checklist)

- [ ] `GET /health` responde `{"ok":true}`.
- [ ] Existe un admin (`npm run crear-admin -- correo clave`, o `SEED_ADMIN_*` + `npm run seed`).
- [ ] `CORS_ORIGIN` restringido a tu dominio de frontend (no `*`).
- [ ] `JWT_SECRET` y `CREDENTIALS_ENC_KEY` son secretos fuertes (no los de ejemplo).
- [ ] HTTPS activo (terminación TLS en el proveedor o un proxy delante).
- [ ] Backups de PostgreSQL configurados en el proveedor de BD.

> ⚠️ **Seguridad:** antes de exponer a internet, revisa el informe de pentest — hay
> dos hallazgos críticos abiertos (`/api/chat` sin auth y `rawChild` en nv-runtime)
> que conviene corregir antes de producción.
