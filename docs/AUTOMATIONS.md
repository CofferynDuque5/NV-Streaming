# AUTOMATIONS.md — Automatizaciones

Dos motores: **Cloud Functions** (Firebase, orientadas a OTP y eventos Firestore) y **crons del backend** (`whatsapp-agent`, orientados a cobros/renovaciones/recordatorios).

---

## 1. Crons del backend (`whatsapp-agent`)

Registrados con `node-cron` en proceso (`src/cron/scheduler.ts`). Se desactivan con `CRON_ENABLED=off`. También ejecutables como CLI de una sola pasada (`npm run job:*`).

| Job | Horario (default) | Trigger → proceso → acción → resultado |
|---|---|---|
| **Recordatorio de vencimiento** | `0 9 * * *` (9:00, `America/Caracas`) | Busca suscripciones que vencen en **exactamente** `REMINDER_DIAS_ANTES` (3) días → envía **plantilla aprobada de WhatsApp** (`vencimiento_perfil`, 5 variables) → informa `{encontradas, enviadas, fallidas}` |
| **Ciclo de renovaciones** | `0 */6 * * *` (cada 6 h) | (1) Suscripciones vencidas activas: si `renovacion_automatica` → extiende el ciclo + notifica; si no → marca `vencida` + guía al pago. (2) Próximas a vencer no automáticas → recordatorio. Informa `{vencidas, renovadas, recordatorios}` |

> ⚠️ **Caveat de negocio verificado en el código** (`renewals.service.ts:66`): la **auto-renovación extiende la suscripción SIN cobrar**. En producción, o bien conectas el cobro real antes de renovar, o mantienes `renovacion_automatica=false` y cobras manualmente. **No confíes en la auto-renovación para cobrar dinero tal como está.**

### Activarlas
- **En proceso:** deja `CRON_ENABLED=on` y ejecuta el backend permanentemente (PM2/systemd/contenedor).
- **Externas:** pon `CRON_ENABLED=off` y programa en tu servidor:
  ```bash
  # crontab del servidor
  0 9 * * *   cd /ruta/whatsapp-agent && npm run job:reminders:prod
  0 */6 * * * cd /ruta/whatsapp-agent && npm run job:renewals:prod
  ```

---

## 2. Cloud Functions basadas en eventos (OTP y bienvenida)

| Evento | Acción |
|---|---|
| Llega mensaje a `telegramWebhook` / `whatsappWebhook` | Extrae el OTP → escribe `codigos_verificacion` |
| Se crea `codigos_verificacion/{id}` (`onCodigoCreado`) | Envía el código al cliente por Telegram (fallback `wa.me`) |
| Se crea `usuarios/{uid}` (`onUsuarioCreado`) | Llama al backend → email de bienvenida |

Ver `docs/CLOUD-FUNCTIONS.md` para desplegar y registrar webhooks.

---

## 3. Cobros (pagos)

- **Manual:** el cliente sube comprobante → se crea `pagos` pendiente → el admin **confirma** (endpoint protegido con `ADMIN_API_TOKEN`), lo que **renueva la suscripción de forma atómica**, notifica por WhatsApp y envía factura por email; si no hay stock, entra a `cola_espera`.
- **Automático (webhooks PSP):** Binance Pay y PagoMóvil verifican **firma HMAC real** y auto-confirman. Son **solo entrantes** (no inician el cobro). **PagoMóvil requiere un puente/agregador externo que debes construir** — no viene incluido. Zelle es siempre manual.

Configura los datos de recepción (`PAGO_MOVIL_*`, `BINANCE_EMAIL`, `ZELLE_*`) y, si usas auto-cobro, `BINANCE_PAY_SECRET` / `PAGO_MOVIL_WEBHOOK_SECRET`.
