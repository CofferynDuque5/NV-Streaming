# DEPLOYMENT.md — Desde cero → producción

Guía completa sin pasos omitidos. Despliegas **tres** cosas: Firebase (reglas + índices + functions), el **backend** Node/Postgres, y el **frontend** estático.

> Antes de empezar, ten listas las cuentas: Firebase (plan **Blaze**), PostgreSQL, OpenAI, WhatsApp Cloud API (Meta), ImgBB, y tu hosting.

---

## Paso 0 — Requisitos locales
```bash
node --version      # >= 20
npm --version       # >= 10
npm install -g firebase-tools
firebase --version
```

## Paso 1 — Crear el proyecto Firebase
1. En https://console.firebase.google.com crea un proyecto.
2. **Upgrade a plan Blaze** (Functions con red saliente lo exige).
3. **Firestore Database** → *Crear base de datos* → modo producción. **Crea la base con ID `default`** (Cloud Console → Firestore → puede requerir crear una base "nombrada" `default`). Ver `docs/FIREBASE.md`.
4. **Authentication** → habilita **Email/Password** y añade tus dominios en *Authorized domains*.
5. **Configuración del proyecto → Tus apps → App web** → copia el objeto de configuración.

## Paso 2 — Configurar credenciales en el código
```bash
# a) .firebaserc → tu Project ID
#    "default": "TU_PROJECT_ID"

# b) site/js/firebase-config.js → apiKey, authDomain, projectId, storageBucket de TU proyecto
#    y confirma DATABASE_ID = "default"

# c) site/js/config.js → api.base (URL futura del backend), imgbb.apiKey, whatsapp.numero
```

## Paso 3 — Login y selección de proyecto
```bash
firebase login
firebase use TU_PROJECT_ID
```

## Paso 4 — Cargar los secretos de Functions
```bash
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set WHATSAPP_API_TOKEN
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set AGENT_URL
firebase functions:secrets:set AGENT_ADMIN_TOKEN
```

## Paso 5 — Instalar deps de Functions y desplegar reglas/índices/functions
```bash
cd functions && npm install && cd ..

firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage          # reglas de Storage (cerradas por defecto)
firebase deploy --only functions
```
Anota las URLs de las functions que imprime la CLI.

## Paso 6 — Base de datos PostgreSQL
1. Crea una base (local o Neon/Supabase/RDS…).
2. Configura el backend:
```bash
cd whatsapp-agent
cp ../.env.example .env      # rellena DATABASE_URL, CREDENTIALS_ENC_KEY, OPENAI_API_KEY, WhatsApp, ADMIN_API_TOKEN, datos de pago...
npm install
npm run migrate              # crea el esquema (usa 'migrate', NO 'migrate:prod' — ver TROUBLESHOOTING)
```
Genera la clave de cifrado antes:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → CREDENTIALS_ENC_KEY
```

## Paso 7 — Arrancar el backend en tu host Node
```bash
cd whatsapp-agent
npm run build
npm start           # node dist/index.js  (usa PM2/systemd/contenedor para mantenerlo vivo)
```
Ponlo detrás de HTTPS (Nginx/Caddy) en el dominio que usaste como `api.base` y `AGENT_URL`.

## Paso 8 — Registrar los webhooks
- **WhatsApp Cloud API (Meta):** webhook → `https://TU_API/webhook`, con `WHATSAPP_VERIFY_TOKEN`. Suscribe `messages`. Aprueba la plantilla `vencimiento_perfil` (5 variables).
- **Telegram / extractor OTP:** apunta a las functions `telegramWebhook` / `whatsappWebhook` (ver `docs/CLOUD-FUNCTIONS.md`).

## Paso 9 — Publicar el frontend
**Opción A — Tu hosting (recomendado, "no Vercel"):** ver `docs/INSTALLATION.md` §Hosting. Sube **el contenido de `site/`** a tu `public_html`.

**Opción B — Firebase Hosting:**
```bash
firebase deploy --only hosting
```

## Paso 10 — Verificación
Sigue la **checklist post-deploy** de `docs/RELEASE-AUDIT.md` §Checklist. Como mínimo: registro/login, catálogo carga desde el backend, un pago de prueba aprobado por admin renueva la suscripción, y el agente de WhatsApp responde.

---

### Comando "todo Firebase" de una vez
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```
