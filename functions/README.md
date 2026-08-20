# NV Streaming — Cloud Functions (Webhooks OTP)

Receptor **centralizado** de webhooks de mensajería (Telegram / WhatsApp) y
automatización de códigos OTP. Sustituye a los scripts procedimentales dispersos
(`procesar_telegram.php`, etc.) por un único controlador seguro y modular.

## Endpoints

| Función | Método | Uso |
|---|---|---|
| `telegramWebhook` | POST | URL de webhook de tu bot de Telegram |
| `whatsappWebhook` | POST | URL de webhook de Evolution API / Baileys / Cloud API |
| `onCodigoCreado` | trigger | Notifica al cliente al crearse un código con perfil asignado |

## Flujo
```
Telegram/WhatsApp ─▶ webhook (valida token) ─▶ parsearMensaje() ─▶
  localiza cuenta_madre ─▶ obsoletiza código anterior ─▶
  crea codigos_verificacion (expira_at +10min) ─▶ onCodigoCreado ─▶ notifica cliente
```

## Seguridad
- Cada webhook valida un **token/secreto** (cabecera `Authorization: Bearer …`,
  `X-Telegram-Bot-Api-Secret-Token`, o `?token=`).
- Entrada **sanitizada** (control chars, `< >`) antes de persistir.
- La escritura la hace el **Admin SDK**, que ignora las reglas de Firestore; el
  cliente queda limitado por `firestore.rules` (solo admin/operador).

## Base de datos
Usa el **mismo fix** que el cliente: base nombrada `default` (sin paréntesis):
```js
const db = getFirestore("default");   // no (default)
```

## Despliegue
```bash
cd functions
npm install
# Secretos (no se hardcodean):
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set WHATSAPP_API_TOKEN
firebase functions:secrets:set TELEGRAM_BOT_TOKEN     # para notificar al cliente
firebase deploy --only functions
```

## Registrar el webhook de Telegram
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://us-central1-nv-streaming.cloudfunctions.net/telegramWebhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## Probar sin bot
El panel `credenciales.html` incluye un **simulador de recepción**: pega un
mensaje (“Tu código de Netflix es 123456”) y ejecuta el mismo parser y flujo de
asignación, escribiendo en Firestore igual que el webhook real.

> El parser (`otp-parser.js`) es idéntico al del cliente
> (`site/js/modules/otp-parser.js`); se duplica solo por la frontera de
> despliegue (Cloud Functions empaqueta únicamente `functions/`).
