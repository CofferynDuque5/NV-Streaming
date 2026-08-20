# 🚀 Guía de despliegue — NV Stream · Agente de WhatsApp

Guía paso a paso para poner el servicio en producción con Docker y conectarlo a
la **WhatsApp Cloud API** de Meta.

---

## 1. Requisitos

- **Docker** y **Docker Compose** en el servidor.
- Un **dominio con HTTPS** válido (Meta exige `https://` con certificado de CA
  para el webhook; no acepta IP ni certificados autofirmados).
- Una cuenta en **[Meta for Developers](https://developers.facebook.com/)** con
  un **WhatsApp Business Account (WABA)**.
- Una clave de **OpenAI**.

---

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Genera los secretos y complétalos en `.env`:

```bash
# Clave de cifrado de credenciales (obligatoria en producción)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → CREDENTIALS_ENC_KEY
# Token admin de la pasarela de pago
node -e "console.log('adm_'+require('crypto').randomBytes(24).toString('hex'))" # → ADMIN_API_TOKEN
# Verify token del webhook (invéntalo, lo usarás también en Meta)
node -e "console.log('vt_'+require('crypto').randomBytes(16).toString('hex'))"  # → WHATSAPP_VERIFY_TOKEN
```

Rellena además: `POSTGRES_PASSWORD`, `OPENAI_API_KEY`, y (tras la sección 5 de
Meta) `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

> En Docker Compose **no necesitas** tocar `DATABASE_URL`: la app la deriva a
> `db:5432` a partir de `POSTGRES_*`. El `DATABASE_URL` del `.env` solo se usa
> para desarrollo local sin Docker.

---

## 3. Levantar la aplicación

```bash
docker compose up -d --build
```

Esto:
1. Construye la imagen (compila TypeScript → `dist`).
2. Arranca **PostgreSQL** con un volumen persistente (`pgdata`).
3. Espera a que la BD esté sana y **aplica el esquema** (`node dist/db/migrate.js`).
4. Inicia el servidor y los **cron** (aviso de vencimiento + renovaciones).

Verifica:

```bash
curl http://localhost:3000/health          # {"ok":true,...}
docker compose logs -f app                  # logs en vivo
```

Comandos útiles:

```bash
docker compose ps                                   # estado
docker compose exec app node dist/jobs/expiry-reminders.job.js   # correr aviso a mano
docker compose exec db psql -U nv -d nv_stream      # abrir psql
docker compose down                                 # detener (conserva datos)
docker compose down -v                              # detener y BORRAR la BD
```

---

## 4. Exponer el servicio por HTTPS

El webhook debe ser accesible públicamente por HTTPS. Dos opciones:

**A) Reverse proxy con TLS (producción)** — p. ej. Caddy delante del contenedor:

```caddyfile
bot.tudominio.com {
    reverse_proxy localhost:3000
}
```

Caddy gestiona el certificado automáticamente. Tu URL de webhook será
`https://bot.tudominio.com/webhook/whatsapp`.

**B) Túnel para pruebas** — `ngrok http 3000` te da una URL `https://….ngrok-free.app`
(cámbiala cada vez que reinicies ngrok).

---

## 5. Configurar la app y el Webhook en Meta

1. **Crear la app**: [developers.facebook.com](https://developers.facebook.com/) →
   *Mis Apps* → *Crear app* → tipo **Business** → añade el producto **WhatsApp**.

2. **Número y IDs**: en *WhatsApp → API Setup* obtienes el **Phone number ID**
   (→ `WHATSAPP_PHONE_NUMBER_ID`) y el **WhatsApp Business Account ID** (WABA ID).
   En pruebas puedes usar el número de test que Meta provee.

3. **App Secret**: *Configuración → Básica → Clave secreta de la app*
   (→ `WHATSAPP_APP_SECRET`).

4. **Token de acceso permanente** (no uses el temporal de 24 h):
   - *Business Settings → Usuarios → Usuarios del sistema* → crea uno (rol Admin).
   - *Agregar activos* → asigna tu app y tu WABA.
   - *Generar token* con los permisos **`whatsapp_business_messaging`** y
     **`whatsapp_business_management`** → cópialo a `WHATSAPP_ACCESS_TOKEN`.

5. **Configurar el Webhook**: *WhatsApp → Configuration → Webhook → Editar*:
   - **Callback URL**: `https://bot.tudominio.com/webhook/whatsapp`
   - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
   - Pulsa **Verificar y guardar**. Meta hará un `GET` y tu servicio responderá
     el `hub.challenge` (verás `Webhook verificado por Meta ✓` en los logs).

6. **Suscribir el campo `messages`**: en la misma pantalla de Webhooks, en
   *Webhook fields*, activa **`messages`**. (Equivale a
   `POST /{WABA_ID}/subscribed_apps` con tu token.)

7. Reaplica el `.env` y reinicia si cambiaste variables:
   ```bash
   docker compose up -d
   ```

> **Firma**: el servicio valida `X-Hub-Signature-256` con tu `WHATSAPP_APP_SECRET`.
> Si ves `401` en `/webhook/whatsapp`, revisa que el App Secret sea el correcto.

---

## 6. Dar de alta la plantilla de mensaje (Template)

Los mensajes iniciados por el negocio (como el aviso de vencimiento a 3 días)
**requieren una plantilla aprobada**.

1. Ve a **WhatsApp Manager → Message Templates → Crear plantilla**.
2. **Categoría**: *Utility / Utilidad* (es un aviso transaccional).
3. **Nombre**: `vencimiento_perfil` — debe coincidir con
   `WHATSAPP_TEMPLATE_VENCIMIENTO`.
4. **Idioma**: *Español* (código `es`, igual que `WHATSAPP_TEMPLATE_LANG`).
5. **Cuerpo** con 5 variables, en este orden exacto:

   ```
   Hola {{1}} 👋, tu perfil privado de {{2}} ({{3}}) vence en {{4}} días, el {{5}}.
   Renueva a tiempo para no perder el acceso. — NV Stream
   ```

   Valores de ejemplo para la revisión de Meta:
   `{{1}}=Nathan`, `{{2}}=Netflix Premium`, `{{3}}=Perfil 1`, `{{4}}=3`, `{{5}}=2026-07-18`.

6. (Opcional) Añade un botón de *Respuesta rápida* “Renovar”.
7. **Enviar** y esperar la aprobación (suele tardar de minutos a unas horas).

> El servicio envía los parámetros en el orden
> `[nombre, servicio, perfil, días, fecha]` — ver
> `buildTemplateParams()` en `src/modules/reminders/expiry-reminder.service.ts`.
> Si cambias el orden/número de variables en Meta, ajústalo también ahí.

---

## 6.b Cobro automático (webhooks del PSP)

Para que el pago libere el perfil **sin intervención manual**:

**Binance Pay**
- En el panel de comerciante de Binance Pay, configura la **URL de notificación**:
  `https://bot.tudominio.com/pagos/webhook/binance`.
- Copia la **API Secret** del comercio a `BINANCE_PAY_SECRET` (y la key a
  `BINANCE_PAY_KEY`). El webhook valida la firma `HMAC-SHA512`.
- Al crear la orden de pago, usa `merchantTradeNo = pagos.referencia` para que el
  webhook pueda mapearla.

**Pago Móvil (Venezuela)**
- No hay webhook estándar: usa un **puente/agregador** (o un bot que lea las
  notificaciones del banco) que haga `POST` a
  `https://bot.tudominio.com/pagos/webhook/pago_movil` con:
  ```
  Header: x-nvpay-signature: <HMAC_SHA256(PAGO_MOVIL_WEBHOOK_SECRET, body)>
  Body:   {"id":"<txid>","referencia":"<ref del cliente>","monto":360.5,"moneda":"VES","estado":"aprobado"}
  ```
- Define `PAGO_MOVIL_WEBHOOK_SECRET` (compártelo con el puente).
- Como el plan está en USD y el Pago Móvil en VES, decide `PSP_STRICT_AMOUNT`:
  `on` exige monedas comparables (rechaza VES vs USD sin tasa); `off` confirma
  por coincidencia de **referencia** (recomendado si tu puente ya valida el monto).

Prueba rápida (firma válida generada a mano):
```bash
SECRET=tu_pago_movil_secret
BODY='{"id":"tx1","referencia":"REF123","monto":10,"moneda":"USD","estado":"aprobado"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')
curl -X POST https://bot.tudominio.com/pagos/webhook/pago_movil \
  -H "content-type: application/json" -H "x-nvpay-signature: $SIG" --data "$BODY"
```

## 7. Probar de punta a punta

1. **Entrante (agente)**: escribe al número de WhatsApp del negocio
   (“¿cómo va mi suscripción?”). En los logs verás el mensaje y la respuesta del
   agente; el cliente recibirá la contestación.
2. **Pasarela de pago** (admin):
   ```bash
   # Registrar un pago (checkout/bot)
   curl -X POST https://bot.tudominio.com/pagos \
     -H 'content-type: application/json' \
     -d '{"whatsappId":"584160000000","servicio":"netflix","metodo":"pago_movil","suscripcionId":"<uuid>"}'

   # Confirmarlo (renueva la suscripción y avisa al cliente)
   curl -X POST https://bot.tudominio.com/pagos/<pago_id>/confirmar \
     -H "authorization: Bearer $ADMIN_API_TOKEN"
   ```
3. **Aviso de vencimiento (template)**:
   ```bash
   docker compose exec app node dist/jobs/expiry-reminders.job.js
   ```
   Enviará la plantilla a quienes venzan en exactamente `REMINDER_DIAS_ANTES` días.

---

## 7.b Correos (bienvenida + factura)

1. Configura SMTP en `.env` del agente: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
   `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `TERMS_URL`. Sin `SMTP_HOST` el correo
   se deshabilita (solo log).
2. **Factura digital**: se envía sola al confirmar un pago (`confirmarPago`).
3. **Bienvenida al registrarse** (Firebase): la Cloud Function `onUsuarioCreado`
   delega el envío al agente. En `functions/` define los secretos:
   ```bash
   firebase functions:secrets:set AGENT_URL          # https://bot.tudominio.com
   firebase functions:secrets:set AGENT_ADMIN_TOKEN  # = ADMIN_API_TOKEN del agente
   firebase deploy --only functions
   ```
   La función llama a `POST /usuarios/bienvenida` con `Bearer AGENT_ADMIN_TOKEN`.

## 8. Notas de producción

- **Backups**: respalda el volumen `pgdata` (o usa un Postgres gestionado y
  apunta `DATABASE_URL` a él, quitando el servicio `db` del compose).
- **Escalado**: si corres varias réplicas de `app`, pon `CRON_ENABLED=off` y
  ejecuta los cron en UNA sola instancia (o vía cron externo con
  `dist/jobs/*.job.js`) para no duplicar avisos.
- **Secretos**: no subas `.env` al repositorio (ya está en `.gitignore`); usa el
  gestor de secretos de tu plataforma.
- **Actualizar**: `git pull && docker compose up -d --build` (la migración se
  reaplica sola; es idempotente).
