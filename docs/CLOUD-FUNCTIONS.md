# CLOUD-FUNCTIONS.md

Cloud Functions en `functions/index.js`. **Runtime Node 20**, región **us-central1**, `maxInstances: 10`. Dependencias: `firebase-admin ^12.6.0`, `firebase-functions ^5.1.1`. Firestore = base con nombre **`default`**.

Todas sirven al **módulo de automatización de OTP** (extracción de códigos de verificación de streaming y entrega al cliente).

---

## Inventario

| Función | Propósito | Trigger | Depende de |
|---|---|---|---|
| `telegramWebhook` | Recibe mensajes de Telegram, extrae el OTP y lo guarda en `codigos_verificacion` | `onRequest` (HTTP) — secreto `TELEGRAM_WEBHOOK_SECRET` | — |
| `whatsappWebhook` | Igual, desde WhatsApp (payloads Evolution/Baileys/genérico) | `onRequest` (HTTP) — secreto `WHATSAPP_API_TOKEN` | — |
| `onCodigoCreado` | Al crear un doc en `codigos_verificacion`, envía el código al cliente por Telegram (con fallback `wa.me`) | `onDocumentCreated('codigos_verificacion/{id}')` | Telegram Bot API |
| `onUsuarioCreado` | Al crear `usuarios/{uid}`, pide al backend enviar el email de bienvenida | `onDocumentCreated('usuarios/{uid}')` | Backend `whatsapp-agent` (`AGENT_URL`) |

`otp-parser.js` es el motor de parseo puro (sanea entrada, extrae códigos 4-8 dígitos / 6 alfanum., detecta plataforma). Sin I/O ni secretos.

---

## Secretos (obligatorios)

```bash
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set WHATSAPP_API_TOKEN
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set AGENT_URL          # p.ej. https://api.tudominio.com
firebase functions:secrets:set AGENT_ADMIN_TOKEN  # = ADMIN_API_TOKEN del backend
```

> ⚠️ **Seguridad:** si `TELEGRAM_WEBHOOK_SECRET` / `WHATSAPP_API_TOKEN` quedan **sin definir**, la validación de token devuelve `true` (modo dev) y **el webhook queda abierto a cualquiera**. Defínelos siempre en producción. Además, el token se acepta por query string (`?token=`) — prefiere cabecera para no filtrarlo en logs.

---

## Despliegue

```bash
# Todas las functions
firebase deploy --only functions

# Una sola
firebase deploy --only functions:onCodigoCreado
```

Requisitos: proyecto en **plan Blaze** (las functions hacen red saliente) y los secretos ya cargados. El índice compuesto de `codigos_verificacion` debe existir (`firebase deploy --only firestore:indexes`).

---

## Registrar los webhooks

Tras desplegar, obtendrás URLs tipo:
`https://us-central1-TU_PROJECT.cloudfunctions.net/telegramWebhook`

- **Telegram:** `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_telegramWebhook>?token=<SECRET>`
- **WhatsApp (extractor OTP):** configura tu proveedor para postear a `whatsappWebhook` con el token.
