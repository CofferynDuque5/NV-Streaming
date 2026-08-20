# ENVIRONMENT.md — Variables de entorno

Tres superficies de configuración. **Solo el backend usa `.env`.**

| Superficie | Cómo se configura |
|---|---|
| **Frontend** (`site/`) | Objeto JS en `site/js/config.js` (`NV_CONFIG`) y `site/js/firebase-config.js`. **No usa `.env`.** |
| **Cloud Functions** (`functions/`) | Secretos vía `firebase functions:secrets:set` (ver `docs/CLOUD-FUNCTIONS.md`). **No usa `.env`.** |
| **Backend** (`whatsapp-agent/`) | Archivo `.env` (plantilla en `.env.example`). Validado con Zod, **arranque fail-fast**. |

---

## 1. Frontend — `site/js/config.js` (`NV_CONFIG`)

| Clave | Para qué | ¿Obligatoria? | ¿Cambiar en prod? |
|---|---|---|---|
| `api.base` | URL del backend `whatsapp-agent` | Para catálogo/IA/pagos vivos | **Sí** → tu URL (p.ej. `https://api.tudominio.com`). Por defecto `http://localhost:3000`. Si es inalcanzable, el frontend degrada a datos locales |
| `imgbb.apiKey` | Subida de imágenes (Back Office) | Para subir imágenes | **Sí** → de https://api.imgbb.com/. Vacía por defecto |
| `whatsapp.numero` | WhatsApp de soporte | Sí | Verifica que sea tu número (formato internacional sin `+`) |
| `moneda.tasaVES` | Tasa USD→VES por defecto | No (el backend la sobreescribe vía `/api/config`) | Opcional |
| `marca.*`, `colores.*` | Identidad visual | No | Opcional |

Y `site/js/firebase-config.js` → credenciales de tu proyecto Firebase (ver `docs/FIREBASE.md`).

---

## 2. Cloud Functions — secretos

`TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `AGENT_URL`, `AGENT_ADMIN_TOKEN`. Ver `docs/CLOUD-FUNCTIONS.md`.

---

## 3. Backend — `whatsapp-agent/.env`

Plantilla completa y comentada en **`.env.example`** (raíz del paquete). Resumen de las **obligatorias**:

| Variable | Obligatoria | Secreto | Nota |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | Postgres; añade `?sslmode=require` si tu host lo pide |
| `CREDENTIALS_ENC_KEY` | ✅ (prod) | ✅ | 32 bytes; la app no arranca sin ella; **respáldala** |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | ✅ | verificación del webhook |
| `WHATSAPP_APP_SECRET` | ✅ | ✅ | valida firma del webhook |
| `OPENAI_API_KEY` | ⚠️ (para IA) | ✅ | sin ella el agente no responde |
| `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | ⚠️ (para enviar) | ✅/– | necesarios para enviar mensajes |
| `ADMIN_API_TOKEN` | ⚠️ | ✅ | sin él, endpoints admin de pago → 503 |

El resto (SMTP, PSP, datos de pago, cron) son opcionales o con default — ver `.env.example`. **Ninguna variable debe llevar secretos reales en `.env.example` ni subirse a git.**
