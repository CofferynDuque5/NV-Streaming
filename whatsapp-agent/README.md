# NV Stream — Agente de IA por WhatsApp

Servicio Node.js/TypeScript que recibe mensajes por **WhatsApp Cloud API**, los
procesa con un **agente de IA (OpenAI · Function Calling)** y consulta la base de
datos **de forma segura** (la IA nunca genera SQL ni inventa datos).

## Arquitectura

```
WhatsApp Cloud API
      │  POST /webhook/whatsapp  (firma HMAC verificada)
      ▼
[ Webhook ]  extrae { idWhatsapp, texto }  ─▶  upsert usuario
      ▼
[ Agente IA ]  system prompt + tools  ─▶  el LLM decide QUÉ función llamar
      ▼
[ Tools ]  el BACKEND ejecuta la función  ─▶  [ Repositorios ]  ─▶  PostgreSQL
      ▲                                                              │
      └───────────  resultado JSON  ◀───────────────────────────────┘
      ▼
[ Agente IA ]  redacta la respuesta final (solo con datos reales)
```

Reglas de negocio garantizadas por diseño:
1. **Perfil único**: índice único parcial `ux_suscripcion_activa_por_cuenta`
   (una cuenta = una suscripción activa = un perfil privado).
2. **La IA no toca la BD**: solo elige herramientas; el backend ejecuta consultas
   parametrizadas en los repositorios.
3. **Sin precios/credenciales inventados**: el prompt lo prohíbe explícitamente;
   los precios vienen de la tabla `planes` y las credenciales solo de la tool.
4. **Módulos limpios**: `webhook/`, `agent/`, `db/` separados.

## Estructura

```
src/
  index.ts · server.ts · config/env.ts · utils/{logger,crypto}.ts
  db/  schema.sql · models.ts · pool.ts · migrate.ts · repositories/*
  modules/
    webhook/  webhook.{routes,controller}.ts · whatsapp.types.ts
    agent/    agent.service.ts · agent.controller.ts · tools.ts · prompt.ts
test/  agent.test.ts · crypto.test.ts
```

## Herramientas del agente (Function Calling)

| Tool (LLM) | Función backend | Devuelve |
|---|---|---|
| `verificarEstadoSuscripcion` | `verificarEstadoSuscripcion(whatsappId)` | suscripciones activas del cliente: estado, **perfil asignado**, días restantes, vencimiento, plan y precio (de BD) — visibilidad en tiempo real |
| `obtenerCredencialesPerfil` | `obtenerCredencialesPerfil(whatsappId, servicio)` | **gate de pago**: solo si la suscripción está `activa` + `pagada` + vigente expone correo, contraseña y perfil; si está vencida/impaga BLOQUEA y devuelve `accion_sugerida:"guiar_al_pago"` |
| `consultarInventario` | `consultarInventario(servicio?)` | **stock real**: cuántos perfiles/cuentas `disponible` quedan por plataforma (o de una en concreto). La IA lo usa antes de ofrecer/procesar para no prometer sin stock |

### Lógica de control de entrega (gate de credenciales)
Antes de exponer nada, el backend valida en la BD:
1. Que exista la suscripción del cliente para ese servicio.
2. Que esté **activa**, **pagada** y **vigente** (`fecha_vencimiento` futura).

Resultado según el estado (la IA nunca ve credenciales cuando se bloquea):

| Situación | Respuesta al LLM |
|---|---|
| activa + pagada + vigente | `encontrado:true` + correo, contraseña, perfil, PIN |
| vencida / fecha pasada | `entrega_bloqueada:true`, `motivo:"suscripcion_vencida"`, `accion_sugerida:"guiar_al_pago"` (+ plan/precio de BD) |
| vigente pero no pagada | `entrega_bloqueada:true`, `motivo:"pago_pendiente"`, `accion_sugerida:"guiar_al_pago"` |
| pausada / cancelada | `entrega_bloqueada:true`, motivo correspondiente |
| nunca tuvo la suscripción | `motivo:"sin_suscripcion"`, `accion_sugerida:"ofrecer_compra"` |

**Seguridad clave:** el `whatsappId` **no lo aporta el modelo** — lo inyecta el
backend desde el contexto autenticado del webhook. Si el modelo intenta usar otro
número, se ignora y se registra. Así un cliente no puede pedir datos de otro.

Cuando una tool devuelve `encontrado:false`, el **prompt del sistema** obliga al
agente a decir que no hay suscripción activa y **prohíbe inventar credenciales,
precios o estados**.

## Puesta en marcha

**Local (desarrollo):**
```bash
npm install
cp .env.example .env          # completa tokens de Meta, DATABASE_URL, OPENAI_API_KEY, CREDENTIALS_ENC_KEY
npm run migrate               # aplica src/db/schema.sql
npm run dev                   # levanta el servidor (webhook + agente)
```

**Docker (producción):**
```bash
cp .env.example .env          # completa secretos (ver DEPLOY.md §2)
docker compose up -d --build  # app + PostgreSQL; migra y arranca solo
curl http://localhost:3000/health
```

📘 **Guía completa de despliegue y configuración de Meta (webhook + plantilla):
[`DEPLOY.md`](./DEPLOY.md)**.

## Envío de mensajes y renovaciones (Paso 3)

**Envío (WhatsApp Cloud API)** — `services/whatsapp.service.ts`: `sendText(to, body)`
hace POST a `graph.facebook.com/{version}/{phoneNumberId}/messages` con Bearer
token. El `AgentController` envía la respuesta del agente al cliente tras generarla.

**Renovaciones / vencimientos** — `modules/renewals/`:
- `runRenewalCycle(dias)` en cada corrida:
  1. **Vencidas** (activas con fecha pasada): si `renovacion_automatica` → renueva
     el ciclo por `plan.duracion_dias` y avisa; si no → marca `vencida` y **guía al
     pago** (con el precio del plan, desde la BD).
  2. **Por vencer** (dentro de `dias`, no automáticas) → recordatorio de pago.
**Aviso de vencimiento a EXACTAMENTE 3 días (Template Message)** — `modules/reminders/`:
- Cron **diario** (`node-cron`, `0 9 * * *`, tz configurable) que busca las
  suscripciones activas que vencen **justo dentro de N días** (coincidencia por
  día calendario: `fecha_vencimiento::date = hoy + N`) y envía a cada cliente un
  **Template Message** de WhatsApp avisando del vencimiento de su **perfil privado**.
- `services/whatsapp.service.ts` → `sendTemplate(to, name, lang, bodyParams)`
  (`type: 'template'`, obligatorio para iniciar conversación fuera de la ventana
  de 24 h).
- Plantilla esperada en Meta (`WHATSAPP_TEMPLATE_VENCIMIENTO`, por defecto
  `vencimiento_perfil`), cuerpo con 5 variables en este orden:
  `{{1}}` nombre · `{{2}}` servicio · `{{3}}` perfil · `{{4}}` días · `{{5}}` fecha.
  Ejemplo de texto para aprobar:
  > *Hola {{1}} 👋, tu perfil privado de {{2}} ({{3}}) vence en {{4}} días, el {{5}}. Renueva a tiempo para no perder el acceso.*

**Planificación (node-cron)** — `src/cron/scheduler.ts` registra ambos jobs
(aviso diario + renovaciones cada 6 h). Formas de ejecutar:
- **In-process**: `startCron()` (activo por defecto; `CRON_ENABLED=off` lo apaga).
- **Cron externo** (recomendado con varias instancias, para no duplicar avisos):
  - `npm run job:expiry-reminders`  → `0 9 * * *`
  - `npm run job:renewals`          → `0 */6 * * *`

> ⚠️ La renovación automática extiende el ciclo; en producción debe ejecutarse
> **tras un cobro exitoso** (integración de pago = trabajo futuro).

## Correos automáticos (bienvenida + factura)

`services/email.service.ts` (SMTP · nodemailer, transporte inyectable) + `modules/billing/invoice.ts`.
- **Bienvenida + T&C**: al registrarse un usuario en Firebase, la Cloud Function
  `onUsuarioCreado` (en `functions/`) llama a `POST /usuarios/bienvenida`
  (protegido con `ADMIN_API_TOKEN`) → correo con enlace **y** adjunto de Términos
  y Condiciones (`TERMS_URL`).
- **Factura digital**: en `confirmarPago`, al aprobarse el pago y liberar el
  perfil, se genera la factura (Servicio, Monto, Fecha de Vencimiento) y se
  envía por correo al cliente como comprobante.
- Sin `SMTP_HOST` configurado, el envío **degrada** (log, no rompe el flujo).

## Pasarela de pago (cierra el ciclo de renovación)

`modules/payments/` + tabla `pagos`. Flujo: registro → confirmación (admin) →
**renovación atómica** de la suscripción.

**Asignación automática de stock**: al confirmar una compra NUEVA, `confirmAndRenew`
toma un perfil `disponible` de `cuentas_streaming` con `FOR UPDATE SKIP LOCKED`
(atómico, sin race conditions), lo marca `asignada`, crea la suscripción y libera
el acceso. Si NO hay stock → registra el pago, encola al cliente (`cola_espera`),
le avisa amablemente por WhatsApp/correo y alerta al administrador
(`alertas_admin` + `ADMIN_WHATSAPP`).

```
Cliente/checkout ─▶ POST /pagos ─▶ pago 'pendiente' + instrucciones (Pago Móvil/Binance/Zelle)
Admin ─▶ POST /pagos/:id/confirmar ─▶ [transacción] pago 'confirmado'
                                       + suscripción: pagada=true, estado='activa', vencimiento +duración
                                     ─▶ aviso al cliente por WhatsApp
                                     ─▶ (al quedar activa+pagada, el gate de credenciales se abre)
```

- El **monto siempre viene del plan** (BD), nunca se inventa.
- `confirmAndRenew` corre en **una transacción** (`withTransaction`): confirma el
  pago y renueva la suscripción de forma atómica; es **idempotente** (un pago ya
  procesado devuelve `null` → HTTP 409), evitando doble renovación.

**Endpoints**
| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/pagos` | público (checkout/bot) — registra pago + devuelve instrucciones |
| `GET`  | `/pagos/pendientes` | admin (`Bearer ADMIN_API_TOKEN`) |
| `POST` | `/pagos/:id/confirmar` | admin — confirma y renueva |
| `POST` | `/pagos/:id/rechazar` | admin — rechaza y avisa |

### Cobro automático (webhook del PSP)

`modules/payments/psp/` recibe la confirmación del procesador y llama a
`confirmarPago` **sin intervención manual** (libera el perfil + avisa por WhatsApp).

```
PSP (Binance Pay / Pago Móvil) ─▶ POST /pagos/webhook/:proveedor
   1. Verifica firma/HMAC del proveedor            (→ 401 si no valida)
   2. Normaliza la notificación (adaptador)
   3. Idempotencia por id_externo                   (transacción única)
   4. Localiza el pago 'pendiente' por referencia
   5. Valida monto/moneda
   6. confirmarPago(pago, "psp:<proveedor>") ─▶ renovación atómica + WhatsApp
```

- **Binance Pay** (`binance.adapter.ts`): firma `HMAC-SHA512` sobre
  `timestamp\n nonce\n body\n` (cabeceras `BinancePay-*`); `bizStatus=PAY_SUCCESS`;
  la referencia es `merchantTradeNo` (asígnala = `pagos.referencia` al crear la orden).
- **Pago Móvil** (`pagomovil.adapter.ts`): contrato para un puente/agregador —
  cabecera `x-nvpay-signature` = `HMAC-SHA256(PAGO_MOVIL_WEBHOOK_SECRET, body)`;
  cuerpo `{ id, referencia, monto, moneda, estado }`.
- Endpoint: `POST /pagos/webhook/binance` · `POST /pagos/webhook/pago_movil`.
- Seguridad: firma verificada, idempotencia, validación de monto (`PSP_STRICT_AMOUNT`),
  y solo estados de éxito confirman. Añadir un proveedor = un archivo adaptador.

> La confirmación **manual** (revisión de comprobante) sigue disponible en
> `POST /pagos/:id/confirmar` como respaldo.

## Pruebas (sin red ni BD)

```bash
npm test               # typecheck + agente + crypto + whatsapp + renovaciones + avisos + pagos + PSP + correo (41 pruebas)
npm run test:agent     # bucle agéntico + gate de credenciales (LLM y repos falsos)
npm run test:whatsapp  # texto y Template Message en Cloud API (fetch falso)
npm run test:renewals  # ciclo de vencidas / auto-renovadas / recordatorios
npm run test:reminders # aviso a EXACTAMENTE 3 días con Template Message
npm run test:payments  # registrar / confirmar (renovación atómica) / rechazar
npm run test:psp       # webhook PSP: firma HMAC, idempotencia, monto, auto-confirmación
npm run test:email     # bienvenida (T&C) + factura digital
```

Cobertura destacada: bucle tool-call→ejecución→respuesta; **gate de pago**
(activa+pagada expone, vencida/impaga bloquea y guía al pago, sin filtrar
credenciales); **inyección segura del whatsappId**; envío por Cloud API; y el
ciclo de renovaciones (expira, auto-renueva y recuerda).
