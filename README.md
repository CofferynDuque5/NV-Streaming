# NV Streaming

Plataforma para vender **servicios de streaming autorizados**: panel de administración, panel de revendedor, panel del cliente, cobros por pasarelas oficiales, soporte y un asistente con IA con permisos estrictos. Todo en español.

> Esta versión reemplaza por completo a la anterior (ver [auditoría](docs/auditoria/INFORME-AUDITORIA.md)). La versión anterior sigue disponible en el historial de git.

## Estado

| Fase                            | Contenido                                                                                                                                                | Estado |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0. Cimientos                    | Monorepo, base de datos y migraciones, acceso completo con 2FA, roles y permisos, auditoría inalterable, sistema de diseño NV, CI con metas de velocidad | ✅     |
| 1. MVP operativo                | Clientes, planes y catálogo, suscripciones, cobros manuales con conciliación, soporte                                                                    | ✅     |
| 2. Revendedores y editor visual | Saldo prepagado, precios mayoristas por nivel, editor de páginas por bloques                                                                             | ✅     |
| 3. Automatizaciones             | Trabajador con cola en PostgreSQL, recordatorios, avisos, escalados y tasa del bolívar                                                                   | ✅     |
| 4. Pagos en línea               | PayPal y Mercado Pago, cobro automático con autorización expresa, devoluciones                                                                           | ✅     |
| 5. Asistente de IA              | Consultas con los permisos de quien pregunta, acciones con confirmación y auditoría                                                                      | ✅     |
| 6. Proveedores y producción     | Entregas por proveedor (manual, códigos, webhook firmado), Docker, HTTPS, respaldos, monitoreo y guía de instalación                                     | ✅     |

Detalle en la [propuesta de arquitectura](docs/arquitectura/PROPUESTA-ARQUITECTURA.md).

## Estructura

```
apps/
  api/        API REST (NestJS + Fastify). Documentación OpenAPI en /api/docs
  web/        Web (Next.js): sitio público, acceso y paneles por rol
packages/
  db/         Esquema de PostgreSQL (Prisma), migraciones y datos de demostración
  shared/     Roles, permisos, validaciones y tipos compartidos por la API y la web
docs/         Auditoría de la versión anterior y arquitectura
```

Todo el stack es gratuito y de código abierto: Node.js, PostgreSQL, NestJS, Next.js, Prisma, Tailwind, Playwright y Lighthouse CI.

## Puesta en marcha local

Requisitos: Node.js 22, pnpm 10 y Docker (o un PostgreSQL 16 propio).

```bash
pnpm install
cp .env.example .env
# Genera la clave de cifrado y pégala en CLAVE_CIFRADO:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d        # PostgreSQL (nv y nv_test) y Mailpit
pnpm build                  # compila paquetes, API y web
pnpm db:deploy              # aplica las migraciones
pnpm db:seed                # crea un usuario de demostración por rol
pnpm dev                    # API en :4000, web en :3000 y el trabajador de automatizaciones
```

Abre http://localhost:3000. Los correos (verificación, recuperación, invitaciones) se muestran en la consola de la API y se guardan en la tabla `correos_salientes`. Si prefieres verlos como en un buzón, usa `CORREO_PROVEEDOR=smtp` con `SMTP_HOST=localhost` y `SMTP_PUERTO=1025` y abre Mailpit en http://localhost:8025.

### Usuarios de demostración

Contraseña de todos: `NvDemo-2026!`

| Correo             | Rol                | Al entrar                                                     |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| admin@nv.test      | Administrador      | Configura la verificación en dos pasos y ve el panel completo |
| operador@nv.test   | Operador / soporte | 2FA; ve el equipo pero no lo gestiona                         |
| ventas@nv.test     | Ventas             | 2FA; panel de administración sin gestión de usuarios          |
| revendedor@nv.test | Revendedor         | 2FA; panel de revendedor                                      |
| cliente@nv.test    | Cliente            | Entra directo a “Mis servicios” (2FA opcional)                |

Para la verificación en dos pasos sirve cualquier aplicación TOTP gratuita (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS…). Los datos de demostración nunca se cargan en producción.

## Instalación en producción

Guía completa, paso a paso y sin conocimientos previos: **[docs/INSTALACION.md](docs/INSTALACION.md)** (servidor gratuito ARM de Oracle Cloud + Cloudflare, HTTPS automático, copias cifradas y monitoreo). Operación diaria y prueba de carga: [docs/OPERACION.md](docs/OPERACION.md).

```bash
git clone https://github.com/CofferynDuque5/NV-Streaming.git ~/nv-streaming
cd ~/nv-streaming && bash infra/instalar.sh
```

- `docker-compose.prod.yml`: PostgreSQL (sin exponer), migraciones, API, trabajador, web, Caddy (80/443), Uptime Kuma (solo por túnel SSH), copias de seguridad y Ollama opcional (perfil `ia`). Imágenes en `apps/api/Dockerfile` (API y trabajador, destino `migrar` para Prisma) y `apps/web/Dockerfile` (Next.js autónomo), para amd64 y arm64.
- `infra/`: `instalar.sh`, `actualizar.sh`, `estado.sh`, `respaldar.sh`, `restaurar.sh`, `crear-admin.sh` (primera cuenta de administración con enlace de invitación y 2FA obligatorio; nunca datos de demostración), la configuración de Caddy y la prueba de carga con k6.
- Las claves se generan en el servidor (`.env.produccion`, fuera de git).

## Automatizaciones y trabajador

Los recordatorios, las facturas de renovación, los avisos de gracia, suspensión y reactivación, el escalado a soporte, el aviso de saldo bajo a revendedores, la tasa del bolívar automática y las alertas al equipo las ejecuta un **proceso trabajador** aparte de la API:

```bash
pnpm start:trabajador       # node apps/api/dist/trabajador.js (en desarrollo lo arranca `pnpm dev`)
```

- **Cola en PostgreSQL** (tabla `trabajos`, sin Redis): los trabajos se reservan con `FOR UPDATE SKIP LOCKED` y un plazo de reserva; si un trabajador se cae, otro los retoma. Reintentos con espera exponencial y estado `fallido` al agotar los intentos. Puedes ejecutar varios trabajadores: las claves únicas impiden duplicados.
- **Programador**: cada automatización programada corre a sus horas de Venezuela (UTC−4, sin horario de verano). Cada ejecución queda registrada con sus contadores y un resumen, visible en el panel de administración.
- **Avisos por evento** (gracia, suspensión, reactivación y saldo bajo) se encolan en la misma transacción que el cambio que los origina.
- **Avisos**: cada aviso deja una fila en `notificaciones` por canal (enviada, fallida u omitida con su motivo) y nunca se envía dos veces. WhatsApp solo se usa con clientes que dieron su consentimiento; los clientes de un revendedor no reciben avisos de cobro de NV, y el cliente puede apagar los recordatorios (los avisos de pago y suspensión siguen llegando).
- El trabajador también **pasa los vencimientos** cada `VENCIMIENTOS_CADA_MINUTOS`. Si no puedes ejecutarlo, `VENCIMIENTOS_EN_API=true` deja que la API lo haga (los avisos esperarán en cola).
- El panel muestra si el trabajador está en marcha (latido cada 30 s en `latidos_trabajador`). Se detiene limpio con `SIGTERM`.

**WhatsApp** (`WHATSAPP_PROVEEDOR=cloud_api`): usa la WhatsApp Cloud API oficial de Meta. Meta exige **plantillas aprobadas** para los mensajes que inicia la empresa; los nombres y parámetros están en `apps/api/src/avisos/whatsapp.ts`. En producción la API no arranca con `cloud_api` sin `WHATSAPP_TOKEN` y `WHATSAPP_TELEFONO_ID`.

**Tasa automática**: lee el dólar de la página oficial del BCV (`TASA_BCV_URL`) o de un JSON propio (`TASA_JSON_URL` + `TASA_JSON_CAMPO`), siempre por https, con tiempo y tamaño máximos y sin seguir redirecciones a otro sitio. Si el valor cambia más del porcentaje configurado respecto de la tasa vigente, no se aplica y se avisa a administración. Viene desactivada: actívala en el panel tras probar la fuente con el botón «Probar».

## Pagos en línea

Los clientes pagan sus facturas en la pasarela oficial (NV Streaming nunca ve datos de tarjeta). Las credenciales van solo en el entorno del servidor; el estado de cada pasarela y la **URL de avisos (webhook)** que hay que registrar se ven en `/admin/pagos-en-linea`. Los bolívares (VES) siguen con pago manual.

### PayPal

Cobra en **USD y EUR** con la API REST oficial (sin SDK): **Orders v2** para el pago con el cliente presente (`POST /v2/checkout/orders`, captura con `POST /v2/checkout/orders/{id}/capture`), **Vault v3** para guardar la cuenta PayPal del cliente cuando autoriza los cobros automáticos, y cobros sin el cliente con una orden que lleva el `vault_id` guardado. Devoluciones con `POST /v2/payments/captures/{id}/refund`. Cada escritura lleva `PayPal-Request-Id` fijo (la orden del intento, la captura de la orden, la clave del cobro o de la devolución): repetir nunca cobra ni devuelve dos veces.

1. En [PayPal Developer](https://developer.paypal.com/dashboard/) → **Apps & Credentials**, elige **Sandbox** o **Live** y crea una app de tipo **Merchant** (REST). Copia **Client ID** y **Secret** a `PAYPAL_CLIENTE_ID` y `PAYPAL_SECRETO`.
2. En la app, en **Features**, deja activado **Accept payments** y activa **Save payment methods** (vault). Sin esto PayPal no devuelve el id guardado y no se pueden hacer cobros automáticos (el pago único sigue funcionando). **En Live, guardar la cuenta PayPal para cobrar después (pagos iniciados por el comercio / reference transactions) puede requerir que PayPal apruebe tu cuenta**: si la opción no aparece o los cobros automáticos fallan con un error de permisos, pídelo al soporte de PayPal. En Sandbox suele estar disponible directamente.
3. **Webhooks** (misma app → **Webhooks → Add Webhook**): pega la URL que muestra `/admin/pagos-en-linea` (`<API_URL_PUBLICA>/api/v1/pasarelas/paypal/webhook`, debe ser https y pública) y suscribe estos eventos: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CHECKOUT.ORDER.APPROVED` y `VAULT.PAYMENT-TOKEN.DELETED`. Copia el **Webhook ID** que muestra PayPal a `PAYPAL_WEBHOOK_ID`. NV verifica cada aviso con `POST /v1/notifications/verify-webhook-signature` (cabeceras `paypal-transmission-*` + ese id) y rechaza con 400 los que no dan `SUCCESS`. Los avisos solo son una pista: NV vuelve a leer la orden antes de registrar dinero.
4. **Modo**: `PAYPAL_MODO=pruebas` usa `api-m.sandbox.paypal.com` (paga con una cuenta personal de prueba de **Sandbox → Accounts**); `PAYPAL_MODO=produccion` usa `api-m.paypal.com` y necesita credenciales y webhook de **Live** (son distintos de los de Sandbox). PayPal solo se ofrece con las tres variables definidas.
5. Crea en Finanzas un método de cobro de tipo «pasarela» PayPal por cada moneda (USD y/o EUR) que vayas a cobrar.

Detalles:

- El cliente vuelve de PayPal a `/cuenta/pagos/retorno`; NV lee la orden y la **captura solo si está aprobada**. Si el cliente aprobó pero cerró el navegador, el aviso `CHECKOUT.ORDER.APPROVED` o la consulta periódica la capturan (el cliente ya pulsó «Pagar ahora»; sin capturar, la aprobación caduca en unas horas).
- La cuenta guardada se muestra como «PayPal · ma\*\*\*@gmail.com»; el id de Vault se guarda cifrado y nunca aparece en registros ni en los avisos guardados. Si el cliente revoca la autorización en NV, se borra también en PayPal (`DELETE /v3/vault/payment-tokens/{id}`); si la borra desde PayPal, llega `VAULT.PAYMENT-TOKEN.DELETED` y NV la marca como revocada.
- Un cobro automático que PayPal deja pendiente (revisión) se resuelve cuando llega `PAYMENT.CAPTURE.COMPLETED`. Si PayPal responde `DUPLICATE_INVOICE_ID`, el cobro queda «en curso» con el error visible para revisarlo a mano en PayPal: nunca se reintenta con otra referencia a ciegas.

### Mercado Pago

Usa **Checkout Pro**: NV crea una preferencia (`POST /checkout/preferences`) y el cliente paga en la página de Mercado Pago. Al volver, NV nunca confía en los parámetros de la URL: lee el pago en la API (`GET /v1/payments/{id}` y `GET /v1/payments/search?external_reference=…`). Las devoluciones usan `POST /v1/payments/{id}/refunds` con `X-Idempotency-Key`.

1. En [Mercado Pago Developers](https://www.mercadopago.com/developers) → **Tus integraciones**, crea una aplicación (producto «Checkout Pro», pagos en línea) con la cuenta del país donde cobrarás.
2. **Pruebas**: en la aplicación crea **cuentas de prueba** (una vendedora y una compradora). Usa el Access Token de prueba de la aplicación (o el de producción de la cuenta vendedora de prueba) y paga con la compradora de prueba y las tarjetas de prueba de la documentación. `MERCADOPAGO_MODO=pruebas` manda al cliente al `sandbox_init_point` (o al `init_point` si no viene).
3. **Producción**: activa las credenciales de producción de la aplicación, copia su **Access Token** a `MERCADOPAGO_TOKEN_ACCESO` y pon `MERCADOPAGO_MODO=produccion`.
4. **Webhooks**: en la aplicación → **Webhooks → Configurar notificaciones**, pega la URL que muestra `/admin/pagos-en-linea` (`<API_URL_PUBLICA>/api/v1/pasarelas/mercadopago/webhook`) en el modo que corresponda, marca el evento **Pagos** y guarda. Copia la **clave secreta** que genera a `MERCADOPAGO_SECRETO_WEBHOOK`: NV valida la cabecera `x-signature` (HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) y rechaza avisos sin firma válida o de hace más de 10 minutos. Los avisos solo son una pista: NV vuelve a leer el pago antes de registrarlo.
5. **Moneda**: `MERCADOPAGO_MONEDA` = `ARS`, `COP` o `PEN`, la de la cuenta. **Una cuenta de Mercado Pago opera en un solo país y moneda**; si necesitas cobrar en varios de estos países necesitas una cuenta por país (hoy NV admite una sola cuenta de Mercado Pago). Sin esta variable Mercado Pago no se ofrece, y NV nunca crea un pago en otra moneda.
6. Crea en Finanzas un método de cobro de tipo «pasarela» Mercado Pago en esa moneda.

Detalles:

- **Sin cobros automáticos** con Mercado Pago: su API no permite que el comercio cobre una tarjeta guardada (Customers/Cards) sin que el cliente escriba el código de seguridad en un formulario de nuestra web, y sus Suscripciones (preapproval) cobran con su propio calendario e importe fijo, no el día de vencimiento de NV. Por eso no se ofrece «guardar el método»; para cobros automáticos usa PayPal.
- Se excluyen efectivo y cajeros (`ticket`, `atm`): quedan pendientes días y el intento de pago dura 2 horas. Tarjetas, dinero en cuenta y transferencias (PSE, etc.) sí se aceptan. La preferencia vence con el intento.
- Si Mercado Pago aprueba un pago después de que el intento venció o se canceló, NV lo registra igual (el dinero nunca se pierde).
- `MERCADOPAGO_API_URL` es solo para las pruebas automáticas (servidor falso local); en producción la API no arranca si tiene valor.

## Asistente de IA

Asistente para el equipo (administración, operación y ventas) en `/admin/asistente`. **Viene desactivado**: una persona con rol de administración lo activa, elige el motor y fija los límites en **/admin/asistente** (configuración). Hay dos motores reales y uno de pruebas:

| Motor                  | Costo                       | Dónde corren los datos                                               |
| ---------------------- | --------------------------- | -------------------------------------------------------------------- |
| **Local (Ollama)**     | Gratis                      | En tu servidor: nada sale de la máquina                              |
| **Claude (Anthropic)** | Por token, con tope mensual | En la API de Anthropic                                               |
| Pruebas (sandbox)      | —                           | Respuestas fijas; solo desarrollo y pruebas, prohibido en producción |

### Qué puede hacer y qué no

- **Consultar** con los permisos y la cartera de quien pregunta: buscar clientes y ver su ficha, suscripciones por vencer, facturas pendientes, pagos por conciliar, tickets abiertos y su conversación, métricas del panel, tasas del día y revendedores con saldo bajo. Ventas solo ve su cartera; una herramienta cuyo permiso no tienes ni siquiera se le ofrece al modelo.
- **Proponer acciones** (pausar, reanudar o emitir la renovación de una suscripción, responder o cambiar un ticket, guardar una nota interna). Una propuesta **no hace nada**: aparece como tarjeta y solo se ejecuta cuando la confirma quien la pidió (o administración), con su permiso vuelto a comprobar. Caduca a los 60 minutos. Propuesta, ejecución, rechazo y fallo quedan en la auditoría (la propuesta con el actor «IA»).
- **Nunca** accede a la base de datos ni ejecuta SQL: solo un catálogo cerrado de herramientas que llaman a los mismos servicios que la web. No ve contraseñas, secretos de 2FA, tokens, datos de tarjeta ni de pasarelas, comprobantes ni códigos de inventario; las notas internas solo con el permiso `clientes.notas`. Antes de enviar nada al motor, un filtro redacta lo que parezca una tarjeta, una cuenta bancaria o IBAN, un token o una clave. El texto de clientes (tickets, nombres) se entrega marcado como datos, no como instrucciones.
- Guarda las conversaciones (solo las ve su dueño) y qué herramientas usó cada respuesta, pero **no** los datos que devolvieron. Los registros del servidor solo llevan ids y recuentos.
- Límites: mensajes por persona y día (se configura en el panel), 10 mensajes por minuto y, con Claude, el tope de gasto del mes.

### Motor local gratis con Ollama (p. ej. VM ARM Always Free de Oracle Cloud)

La VM Ampere A1 del nivel Always Free (hasta 4 OCPU y 24 GB de RAM) alcanza para un modelo de 7–8 mil millones de parámetros en CPU.

1. Instala Ollama en el mismo servidor que la API: `curl -fsSL https://ollama.com/install.sh | sh`. Queda como servicio systemd escuchando en `127.0.0.1:11434`. **No abras ese puerto** a internet: no tiene autenticación.
2. Descarga el modelo: `ollama pull qwen2.5:7b-instruct` (unos 4,7 GB). Es el recomendado: buen español y buen uso de herramientas. Alternativas: `llama3.1:8b` (similar, algo más flojo en español) o `qwen2.5:3b-instruct` (más rápido, peor eligiendo herramientas).
3. En el `.env` de la API: `OLLAMA_URL=http://127.0.0.1:11434` y `OLLAMA_MODELO=qwen2.5:7b-instruct` (son los valores por defecto). El panel comprueba que Ollama responde y que el modelo está descargado.
4. **Memoria**: calcula unos **8 GB de RAM** libres para el modelo 7B con el contexto de 8k que usa NV (más la API, PostgreSQL y la web).
5. **Velocidad en CPU**: con 4 núcleos ARM, espera unas pocas palabras por segundo; una respuesta que consulta herramientas puede tardar de 20 a 90 s, y la primera tras un rato sin uso tarda más porque carga el modelo (NV lo mantiene cargado 30 min). Si se queda corto, sube `OLLAMA_TIEMPO_LIMITE_S` (por defecto 120) o usa un modelo más pequeño.

### Cambiar a Claude (de pago)

1. En [console.anthropic.com](https://console.anthropic.com) crea una clave (**API Keys**) y ponla en `ANTHROPIC_API_KEY`.
2. Elige el modelo en la consola o la documentación de Anthropic y copia su **id exacto** en `ANTHROPIC_MODELO` (NV no trae ningún modelo fijo).
3. Copia el precio de ese modelo en USD por millón de tokens de la página de precios de Anthropic a `ANTHROPIC_PRECIO_ENTRADA_MTOK` y `ANTHROPIC_PRECIO_SALIDA_MTOK` (p. ej. `3` y `15`). Sin estos cuatro valores Claude no se ofrece. Si cambias de modelo, actualiza también los precios.
4. Reinicia la API, entra en **/admin/asistente**, elige «Claude (Anthropic)» y fija el **tope de gasto mensual** en USD. NV suma tokens y costo de cada llamada (mes en hora de Venezuela) y, al llegar al tope, el asistente responde «Se alcanzó el tope de gasto del mes» hasta el mes siguiente o hasta que subas el tope. Como un mensaje puede hacer hasta 5 llamadas, el gasto real puede pasar el tope en lo que cuesta un mensaje. Pon también un límite de gasto en la consola de Anthropic como segunda barrera.

`ANTHROPIC_API_URL` es solo para las pruebas automáticas (servidor falso local); en producción la API no arranca si tiene valor, ni con `ASISTENTE_SANDBOX_HABILITADO=true`.

## Entregas y proveedores

NV solo vende **servicios autorizados**: su servicio propio con licencia y la reventa como **distribuidor oficial**. **NV nunca entrega usuarios ni contraseñas de cuentas de terceros, ni cuentas compartidas**: lo que recibe el cliente es un código de canje, una tarjeta o un enlace de activación oficial, o los pasos para activar su propia cuenta. La API rechaza cualquier texto que parezca una credencial (al completar a mano, al subir códigos, en las instrucciones y en las respuestas de los proveedores).

Cuando se confirma el pago de un alta o de una renovación, o un revendedor compra una activación, se crea una **entrega** en la misma transacción (una por pago, sin duplicados) y el trabajador la procesa con el **adaptador** de su proveedor. Se elige en **Catálogo → proveedor → Entrega** (`/admin/catalogo/proveedores/<id>`):

| Adaptador                 | Para qué                                              | Cómo funciona                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**                | Servicio propio o acuerdos sin integración            | La entrega queda pendiente y se avisa al equipo con `entregas.gestionar`. Alguien la completa en `/admin/entregas` con los pasos para activar y, si hace falta, un enlace oficial (https) o un código.                                                                                                                                                                  |
| **Códigos de inventario** | Tarjetas o códigos de canje comprados al distribuidor | Se suben lotes por plan en `/admin/inventario` (pegados o en .txt/.csv). Cada código se guarda **cifrado** (AES-256-GCM) con una huella para descartar repetidos, y nunca se vuelve a mostrar al equipo. Cada entrega toma uno con `FOR UPDATE SKIP LOCKED` (nunca el mismo dos veces). Sin existencias, la entrega espera y se reintenta al subir un lote o cada hora. |
| **Webhook firmado**       | Plataforma propia o API de un distribuidor oficial    | NV llama a la URL del proveedor con el contrato de abajo; lo que responda (código, enlace, instrucciones) se guarda cifrado para el cliente.                                                                                                                                                                                                                            |

- El cliente ve sus servicios en **Mis accesos** (`/cuenta/accesos`) y el revendedor los de sus clientes en `/revendedor/accesos`. El código o enlace solo se descifra al pulsar «Mostrar», con confirmación, un aviso de no compartirlo, límite de 30 por hora y registro en la auditoría. Los correos avisan de que el acceso está listo, **sin el código**.
- Los códigos **nunca** van a los registros del servidor, a la auditoría (solo un prefijo de su huella) ni al asistente de IA (solo ve el estado de la entrega).
- La automatización **«Pocos códigos en inventario»** (`stock_bajo_codigos`) avisa a quien tiene `inventario.gestionar` cuando un plan baja del umbral configurado.
- Cuando una suscripción termina (cancelada, o vencida tras la suspensión) o se reembolsa la compra de un revendedor, las entregas no hechas se anulan y las de webhook se **revocan** con el evento `entrega.revocada`. Un código ya entregado no se puede recuperar.
- Permisos: `entregas.ver` y `entregas.gestionar` (administración y operación), `inventario.gestionar` (solo administración).

### Contrato del webhook de entrega

NV hace `POST` a la URL configurada con un cuerpo JSON y estas cabeceras:

| Cabecera          | Valor                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| `NV-Evento`       | `entrega.solicitada`, `entrega.revocada` o `ping` (botón «Probar webhook»)     |
| `NV-Id-Entrega`   | id de la entrega (uuid)                                                        |
| `Idempotency-Key` | el mismo id: los reintentos repiten la clave, no crees la activación dos veces |
| `NV-Firma`        | `t=<segundos unix>,v1=<hex de HMAC-SHA256(clave, "<t>.<cuerpo crudo>")>`       |

```json
{
  "evento": "entrega.solicitada",
  "idEntrega": "3f0c…",
  "fecha": "2026-09-25T14:00:00.000Z",
  "motivo": "alta",
  "plan": { "id": "…", "sku": "SKU-DEL-PROVEEDOR", "nombre": "Tarjeta 30 días" },
  "cliente": { "id": "…" },
  "periodo": { "inicio": "2026-09-25T14:00:00.000Z", "fin": "2026-10-25T14:00:00.000Z" }
}
```

`motivo` es `alta`, `renovacion` o `compra` (revendedor). `cliente.correo` solo se envía si activas «Enviar el correo del cliente al proveedor» porque el acuerdo lo exige. `entrega.revocada` lleva `{ evento, idEntrega, fecha, referencia, motivo }`.

**Respuesta** (JSON, máximo 64 KB, dentro del tiempo límite configurado de 2 a 30 s): `{ "referencia": "…", "codigo": "…", "enlace": "https://…", "instrucciones": "…" }`, todos opcionales. `enlace` debe ser https. Si la respuesta parece traer usuario y contraseña, la entrega queda **fallida** y no se muestra nada al cliente.

| Respuesta del proveedor                           | Resultado                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2xx                                               | Entregada                                                                       |
| 409, o 4xx con `{"codigo":"ya_existe"}`           | Entregada (ya la tenías: idempotencia)                                          |
| 408, 425, 429, 5xx, tiempo agotado o sin conexión | Reintento a 1 min, 5 min, 30 min, 2 h y 12 h; después fallida y aviso al equipo |
| Otro 4xx o una redirección                        | Fallida (sin reintento); el equipo la revisa y puede reintentarla a mano        |
| A `entrega.revocada`: 2xx, 404 o 410              | Revocada                                                                        |

NV **no sigue redirecciones**, solo llama por **https** y nunca a direcciones privadas, locales o reservadas (se comprueba la IP resuelta en cada llamada). La clave de firma se genera en el panel («Generar clave de firma»), se guarda cifrada y **se muestra una sola vez**: compártela con el proveedor por un canal seguro. Al rotarla, la anterior deja de valer.

Verificación en Node.js (del lado del proveedor), sobre el cuerpo **crudo** tal como llegó:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmaValida(clave, cabecera, cuerpoCrudo, toleranciaSegundos = 300) {
  const partes = Object.fromEntries(
    String(cabecera ?? '')
      .split(',')
      .map((p) => p.trim().split('=')),
  );
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(partes.v1 ?? '')) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSegundos) return false;
  const esperada = createHmac('sha256', clave).update(`${t}.${cuerpoCrudo}`).digest();
  return timingSafeEqual(esperada, Buffer.from(partes.v1, 'hex'));
}
```

Responde 401 si la firma no es válida y guarda `idEntrega` para no activar dos veces el mismo pedido.

### Qué configurar por proveedor

1. **Adaptador** en Catálogo → proveedor → Entrega, y las **instrucciones** que verá el cliente (sin secretos). Decide si las renovaciones generan una entrega nueva.
2. **SKU del proveedor** en cada plan (lo recibe el webhook en `plan.sku`).
3. Códigos: sube los lotes en `/admin/inventario` y ajusta el umbral de «Pocos códigos en inventario» en Automatizaciones.
4. Webhook: la URL https del proveedor, el tiempo límite, «Generar clave de firma» (entrégala por un canal seguro) y «Probar webhook» (envía un `ping` firmado). Activa «Enviar el correo del cliente al proveedor» solo si el acuerdo lo exige.

Variables: `ENTREGAS_EN_API=true` hace que la API procese las entregas si no ejecutas el trabajador. `ENTREGAS_WEBHOOK_RED_LOCAL` solo existe para las pruebas automáticas (permite http y direcciones locales); nunca lo actives en producción.

Los datos de demostración incluyen **NV Originals** (servicio propio, entrega manual, plan «Pase 30 días») y el «Distribuidor de demostración» con 10 códigos **falsos** (`DEMO-XXXX-0001`…) en su plan de tarjetas.

## Pruebas

```bash
pnpm lint && pnpm typecheck
pnpm test                 # unitarias
pnpm test:integration     # API contra PostgreSQL real (usa DATABASE_URL_PRUEBAS y la vacía)
pnpm test:e2e             # navegador con cada rol (usa DATABASE_URL_E2E o DATABASE_URL_PRUEBAS)
pnpm --filter @nv/web lighthouse   # velocidad en móvil; requiere la web en :3100
```

Las pruebas nunca usan la base de desarrollo: se niegan a arrancar si `DATABASE_URL_PRUEBAS` es igual a `DATABASE_URL`, y el vaciado previo a las e2e solo actúa sobre bases que terminan en `_test` o `_e2e`. Para las e2e locales con un Chromium ya instalado: `NAVEGADOR_E2E=/ruta/al/chromium pnpm test:e2e`.

La CI (GitHub Actions) ejecuta todo lo anterior en cada PR y exige en móvil: rendimiento ≥ 90, accesibilidad ≥ 95, LCP ≤ 3 s, CLS ≤ 0,1 y TBT ≤ 300 ms.

## Seguridad (resumen)

- **Contraseñas** con Argon2id; mensajes que no revelan si un correo existe; límites de intentos guardados en PostgreSQL.
- **Sesiones** en base de datos con cookie `httpOnly` + `SameSite=Lax` (prefijo `__Host-` con HTTPS). Solo se guarda el hash del token; caducan por tiempo total e inactividad y se pueden cerrar a distancia.
- **Verificación en dos pasos** obligatoria para administración, operación, ventas y revendedores. Secreto cifrado con AES-256-GCM, códigos no reutilizables y 10 códigos de respaldo de un solo uso. La sesión cambia de token al completar el segundo factor.
- **Permisos** comprobados en la API en cada petición con el rol actual de la base de datos. Nadie puede cambiar su propio rol ni dejar el sistema sin administradores.
- **CSRF**: toda escritura exige la cabecera `Origin` de la web.
- **Auditoría** de cada acción sensible (quién, qué, antes/después, IP e id de petición). Un disparador de PostgreSQL impide modificarla o borrarla.
- La API **no arranca en producción** con valores de ejemplo (clave, base de datos, correo sandbox, HTTP).

## API

Con `DOCS_API_HABILITADA=true`, la documentación OpenAPI está en http://localhost:4000/api/docs. Los errores siempre tienen la forma `{ "error": { "codigo", "mensaje", "campos?" } }`, con `codigo` estable y `mensaje` en español.
