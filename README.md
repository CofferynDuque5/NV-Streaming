# NV Streaming v1.0

Plataforma de venta y gestión de suscripciones de streaming (Netflix, Spotify, Disney+, etc.), con catálogo, carrito, billetera, panel de administración, panel de revendedores, agente de IA por WhatsApp y automatizaciones de cobro/renovación.

> **Estado de release:** `READY con condiciones` — lee **`docs/RELEASE-AUDIT.md`** antes de desplegar. Contiene el go/no-go, los bloqueos resueltos, los pendientes y qué debes configurar tú.

---

## 1. Qué es (arquitectura real)

NV Streaming v1.0 es un **híbrido de tres piezas**, no una sola app:

| Pieza | Carpeta | Tecnología | Función | Dónde se despliega |
|---|---|---|---|---|
| **Frontend** | `site/` | HTML + JS (ES modules), Firebase Web SDK 10.12.5 | Todas las pantallas (catálogo, carrito, billetera, mi-cuenta, admin, revendedor) | Tu hosting estático (`public_html`) **o** Firebase Hosting |
| **Cloud Functions** | `functions/` | Node 20, firebase-functions | Webhooks de OTP (Telegram/WhatsApp), entrega de códigos, email de bienvenida | Firebase (`firebase deploy`) |
| **Backend + IA** | `whatsapp-agent/` | Node 20 / TypeScript, Express, **PostgreSQL**, OpenAI | API que consume el frontend (`/api/servicios`, `/api/config`, `/api/chat`, `/api/user/profile`), pagos, agente de IA por WhatsApp, crons | Un host con Node (VPS/contenedor) — **no** cabe en hosting estático |

**Fuentes de datos:** Firebase **Firestore** (contenido/CMS del frontend, usuarios, pedidos, soporte) + **PostgreSQL** (catálogo con stock, suscripciones, pagos y credenciales cifradas del backend).

> ⚠️ **Importante:** si despliegas **solo** `site/` + Firebase, el frontend funciona pero con **catálogo de demostración local**, sin tasa BCV viva, sin IA y sin pagos automáticos (degrada con elegancia). Para la experiencia completa necesitas también el backend `whatsapp-agent`. Ver `docs/DEPLOYMENT.md`.

---

## 2. Tecnologías

- **Frontend:** HTML5, CSS, JavaScript ES modules (sin bundler), Firebase Web SDK (App/Firestore/Auth) por CDN.
- **Cloud Functions:** Node 20, `firebase-admin`, `firebase-functions` v5.
- **Backend:** Node 20, TypeScript (ES2022), Express 4, PostgreSQL (`pg`), OpenAI SDK v4, node-cron, nodemailer.
- **Infra:** Firebase (Firestore, Auth, Functions, opcional Hosting), PostgreSQL, WhatsApp Cloud API (Meta), ImgBB (imágenes), opcional Binance Pay / PagoMóvil.

---

## 3. Requisitos

- **Node.js ≥ 20** y **npm ≥ 10**.
- **Firebase CLI** (`npm i -g firebase-tools`).
- Una cuenta/proyecto de **Firebase** (plan Blaze para Functions con red saliente).
- Una base **PostgreSQL** accesible (local, o Neon/Supabase/RDS…).
- Cuenta de **OpenAI** (para el agente de IA).
- App de **WhatsApp Cloud API** en Meta for Developers.
- Tu **hosting** para el frontend estático.

---

## 4. Puesta en marcha (resumen)

El detalle está en `docs/INSTALLATION.md` y `docs/DEPLOYMENT.md`. En corto:

```bash
# 1. Configura Firebase
#    - Edita .firebaserc con tu PROJECT_ID
#    - Edita site/js/firebase-config.js con las credenciales de TU proyecto
firebase login
firebase use TU_PROJECT_ID

# 2. Despliega reglas, índices y functions
firebase deploy --only firestore:rules,firestore:indexes,storage,functions

# 3. Backend (whatsapp-agent)
cd whatsapp-agent
cp ../.env.example .env      # y rellénalo
npm install
npm run migrate              # crea el esquema en PostgreSQL
npm run build && npm start

# 4. Frontend: sube el contenido de site/ a tu hosting (public_html)
#    o usa Firebase Hosting:  firebase deploy --only hosting
```

---

## 5. Qué debes configurar tú (imprescindible)

Ver la guía completa en **`docs/FIREBASE.md`** y **`docs/ENVIRONMENT.md`**. Lo mínimo:

1. **`site/js/firebase-config.js`** → credenciales de tu proyecto Firebase.
2. **`.firebaserc`** → tu `PROJECT_ID`.
3. **`site/js/config.js`** → `imgbb.apiKey`, `whatsapp.numero`, `moneda.tasaVES`. `api.base` va **vacío** (mismo origen: nginx hace proxy de `/api` al backend, ver `deploy/nginx.conf`); ponle una URL completa solo si sirves el backend en otro host/puerto sin proxy.
4. **`whatsapp-agent/.env`** → `DATABASE_URL`, `CREDENTIALS_ENC_KEY`, `OPENAI_API_KEY`, credenciales de WhatsApp, `ADMIN_API_TOKEN`, datos de pago…
5. **Secretos de Cloud Functions** → `firebase functions:secrets:set` (ver `docs/CLOUD-FUNCTIONS.md`).

---

## 6. Documentación

| Documento | Contenido |
|---|---|
| `docs/RELEASE-AUDIT.md` | **Informe final** de release: go/no-go, hallazgos, riesgos, pendientes v1.1 |
| `docs/INSTALLATION.md` | Instalación paso a paso desde cero |
| `docs/DEPLOYMENT.md` | Despliegue a producción (frontend + functions + backend) |
| `docs/FIREBASE.md` | Cada valor de Firebase: qué es y si debes configurarlo |
| `docs/ENVIRONMENT.md` | Todas las variables de entorno |
| `docs/DATABASE.md` | Firestore (colecciones/reglas) + PostgreSQL (esquema) |
| `docs/CLOUD-FUNCTIONS.md` | Inventario de Functions y despliegue |
| `docs/AUTOMATIONS.md` | Cobros, renovaciones, recordatorios, crons |
| `docs/AI-AGENT.md` | Agente de IA: modelo, herramientas, límites, costes |
| `docs/SECURITY.md` | Reglas de seguridad y modelo de acceso por rol |
| `docs/TROUBLESHOOTING.md` | Problemas comunes y soluciones |
| `docs/CHANGELOG.md` | Cambios de esta release |

---

## 7. Seguridad — no lo olvides

- La `apiKey` de Firebase en `firebase-config.js` **es pública por diseño** (no es un secreto). La seguridad real la dan las **reglas de Firestore** (`site/firestore.rules`) y **Auth**.
- Los **secretos de verdad** (OpenAI, WhatsApp, DB, cifrado, pagos) van en `.env` / secretos de Functions y **nunca** se suben a git.
- Antes de abrir al público, revisa **`docs/SECURITY.md`**: esta release corrige dos vulnerabilidades críticas de las reglas (escalada de privilegios y chats de soporte públicos).
