# NV Streaming: propuesta de arquitectura, tecnologías y modelo de datos

**Fecha:** 23 de septiembre de 2026 · **Versión:** 3 · **Estado:** propuesta para aprobar antes de escribir código
**Parte de:** la auditoría del ZIP anterior (`auditoria/INFORME-AUDITORIA.md`) y la decisión de vender **servicios propios y servicios de distribuidores oficiales** con un catálogo genérico.
**Cambios en la versión 3:** el revendedor trabaja con **precio mayorista y saldo prepagado** (secciones 5.6 y 7).
**Cambios en la versión 2:** se añaden el **panel de revendedor** y el **editor visual**, se responde si Next.js hará lento el sitio (sección 3) y todo el proyecto se ajusta a **herramientas gratuitas** (sección 2). Redis desaparece: las colas y los límites de uso pasan a PostgreSQL, y eso deja un servicio menos que alojar.

---

## 1. Principios

1. **Seguro por defecto.** El servidor decide precios, permisos y estados. El navegador solo muestra lo que el servidor devuelve. Nunca se simula un éxito.
2. **Todo lo sensible deja rastro.** Cada cambio de clientes, pagos, suscripciones, saldos de revendedor, contenido del sitio y automatizaciones, y cada acción de la IA, escribe en un registro de auditoría de solo inserción.
3. **Integraciones detrás de adaptadores.** Pasarelas de pago, WhatsApp, correo, IA y proveedores de servicio implementan una interfaz común. Cambiar de proveedor es escribir un adaptador, no tocar el negocio.
4. **Cero credenciales inventadas.** Cada integración lee sus claves de variables de entorno y trae un adaptador de pruebas (sandbox) que funciona sin cuentas reales.
5. **Sin datos falsos en pantalla.** Si no hay datos, la interfaz lo dice con un estado vacío.
6. **Gratis por defecto.** Todo el software es de código abierto y sin licencia de pago. El alojamiento usa planes gratuitos permanentes. Lo que no puede ser gratis se dice claramente (sección 2.2).
7. **Rápido por defecto.** El sitio público tiene metas de velocidad medidas en cada cambio (sección 3).

---

## 2. Tecnologías (todas gratuitas y de código abierto)

| Capa                                                                                              | Elección                                                                                                                                                            | Por qué                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje                                                                                          | **TypeScript** en todo el proyecto                                                                                                                                  | Un solo lenguaje y tipos compartidos entre API y web                                                                                                                    |
| Repositorio                                                                                       | **Monorepo** con pnpm y Turborepo                                                                                                                                   | Web, API, trabajador y paquetes compartidos versionados juntos                                                                                                          |
| Web (sitio público, panel del cliente, panel de revendedor, panel administrativo y editor visual) | **Next.js** (App Router) con React, **Tailwind CSS** y componentes accesibles propios sobre Radix                                                                   | Rutas protegidas en el servidor, escapado automático contra XSS, responsive real, páginas públicas pre-generadas y un sistema de diseño propio de NV (no una plantilla) |
| Editor visual                                                                                     | **Puck** (editor visual para React, licencia MIT) o un editor propio con dnd-kit (MIT)                                                                              | Arrastrar y soltar bloques con vista previa en vivo. Ver sección 7                                                                                                      |
| API                                                                                               | **NestJS** sobre Fastify                                                                                                                                            | Módulos, guardas de rol y permiso por ruta, validación y **documentación OpenAPI generada automáticamente**                                                             |
| Validación                                                                                        | **Zod**, con esquemas compartidos entre web y API                                                                                                                   | Una sola definición de cada formulario y cada petición                                                                                                                  |
| Base de datos                                                                                     | **PostgreSQL 16**                                                                                                                                                   | Transacciones, `NUMERIC` para dinero, restricciones, JSONB donde haga falta                                                                                             |
| Acceso a datos y migraciones                                                                      | **Prisma**, con migraciones versionadas y revisables                                                                                                                | Sustituye al `schema.sql` único de la versión anterior                                                                                                                  |
| Colas y tareas programadas                                                                        | **pg-boss** (colas sobre la misma PostgreSQL), en un proceso trabajador aparte                                                                                      | Recordatorios, cobros, reintentos y suspensiones sin duplicados. Evita alojar Redis                                                                                     |
| Límites de uso (rate limiting)                                                                    | Guardados en PostgreSQL, por IP y por cuenta                                                                                                                        | Sin servicios extra                                                                                                                                                     |
| Autenticación                                                                                     | Sesiones propias en base de datos, **cookie httpOnly**, contraseñas con **Argon2id**, verificación de correo, recuperación, **2FA TOTP obligatorio para el equipo** | Sin tokens en `localStorage`; sesiones que se pueden ver y cerrar                                                                                                       |
| IA                                                                                                | Adaptador de IA con dos opciones: **Claude (API de Anthropic)** o un **modelo abierto local** (Ollama). Desactivada por defecto                                     | Ver 2.2: la API de Claude cobra por uso                                                                                                                                 |
| Correo                                                                                            | Adaptador SMTP (sirve con el plan gratuito de cualquier proveedor de correo transaccional) y sandbox                                                                |                                                                                                                                                                         |
| WhatsApp                                                                                          | Adaptador de WhatsApp Cloud API (plantillas aprobadas) y sandbox                                                                                                    | Ver 2.2 sobre el costo de los mensajes                                                                                                                                  |
| Pruebas                                                                                           | Vitest, pruebas de integración contra PostgreSQL real, Playwright (flujos completos en móvil y escritorio), **Lighthouse CI** (velocidad)                           | Todo gratuito y de código abierto                                                                                                                                       |
| Calidad                                                                                           | ESLint, Prettier, comprobación de tipos y pruebas en **GitHub Actions** en cada PR                                                                                  | Gratis dentro de los minutos mensuales que GitHub incluye                                                                                                               |
| Despliegue                                                                                        | Docker Compose (web, API, trabajador, PostgreSQL) detrás de Caddy (HTTPS automático) y **Cloudflare** (plan gratuito: CDN, caché y protección)                      | Ver 2.1                                                                                                                                                                 |
| Copias de seguridad                                                                               | `pg_dump` programado y cifrado, guardado en almacenamiento de objetos gratuito                                                                                      | Con prueba de restauración documentada                                                                                                                                  |
| Observabilidad                                                                                    | Logs estructurados con redacción de PII, health checks y **Uptime Kuma** (monitor de disponibilidad, autoalojado)                                                   | Sin servicios de pago                                                                                                                                                   |

### 2.1 Alojamiento gratuito recomendado

| Opción                                                                           | Qué ofrece                                                                                                                                                                                                 | Veredicto                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Máquina virtual "Always Free" de Oracle Cloud** + Cloudflare gratuito          | Una VM ARM siempre encendida con varios núcleos y bastante memoria, suficiente para web, API, trabajador, PostgreSQL y un modelo de IA local pequeño. Cloudflare sirve las páginas públicas desde su caché | **Recomendada.** Es la única opción gratuita sin "arranques en frío" (el servidor no se duerme). Pide una tarjeta para verificar la identidad, sin cobrar |
| Plataformas con plan gratuito que "duermen" el servidor tras un rato sin visitas | Despliegue sencillo                                                                                                                                                                                        | **No recomendada:** la primera visita tras la pausa tarda varios segundos, justo lo contrario de un sitio rápido                                          |
| Plan gratuito de Vercel para Next.js                                             | Muy rápido                                                                                                                                                                                                 | **No sirve:** su plan gratuito es solo para uso no comercial, y NV Streaming es un negocio                                                                |

Verificaré las condiciones vigentes de cada servicio antes de configurarlo, porque los planes gratuitos cambian.

### 2.2 Lo que no puede ser gratis, y cómo lo minimizo

| Elemento                                                       | Por qué tiene costo                                                                                     | Cómo lo manejo                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Comisiones de la pasarela de pago**                          | Toda pasarela oficial cobra un porcentaje por transacción. Suelen no tener cuota mensual                | Los pagos manuales (transferencia, Pago Móvil con comprobante) no pagan comisión y están en el MVP                                                                                                                                         |
| **Dominio propio** (p. ej. `nvstreaming.com`)                  | Se paga por año, poco dinero                                                                            | Es lo único que recomiendo pagar: un subdominio gratuito no transmite confianza a quien paga                                                                                                                                               |
| **Mensajes de WhatsApp que inicia la empresa** (recordatorios) | Meta cobra cada mensaje de plantilla; responder a un cliente que escribió en las últimas 24 h es gratis | Recordatorios por **correo** (gratis) por defecto y WhatsApp como canal opcional que activas cuando quieras                                                                                                                                |
| **Asistente de IA con Claude**                                 | La API de Anthropic cobra por uso                                                                       | Opción A: Claude, con un límite de gasto mensual configurable. Opción B: **modelo abierto local en la misma VM, gratis pero con respuestas más lentas y menos precisas**. La IA llega en una fase tardía, así que se puede decidir después |

---

## 3. ¿Next.js hará lento el sitio?

**No, bien usado hará el sitio más rápido que la versión anterior.** La lentitud no viene de Next.js sino de cómo se usa. La versión anterior era lenta por diseño:

- enviaba 180 KB de HTML con miles de estilos en línea;
- pintaba un catálogo de ejemplo y luego lo reemplazaba;
- reescribía la página con parches después de cada render;
- consultaba unas 22 colecciones cada 15 segundos en cada pestaña.

Cómo evito la lentitud con Next.js:

1. **Páginas públicas pre-generadas.** Inicio, catálogo, fichas de planes y páginas del editor visual se generan como HTML estático y se regeneran solo cuando cambias algo en el panel. Cloudflare las sirve desde su caché, cerca del visitante.
2. **Casi nada de JavaScript en el sitio público.** Uso componentes de servidor, que no envían código al navegador. Solo los elementos interactivos (carrito, buscador) cargan JavaScript.
3. **Imágenes optimizadas** en formatos modernos, con tamaños por dispositivo y carga diferida. Fuentes alojadas en el propio sitio.
4. **Sin sondeos constantes.** Los datos se piden cuando hacen falta.
5. **Los paneles no afectan al sitio público.** Admin, revendedor y editor cargan su propio código solo después de iniciar sesión.
6. **Servidor siempre encendido** (sección 2.1), sin esperas de arranque.

**Metas de velocidad, medidas automáticamente en cada PR con Lighthouse CI:**

| Métrica (móvil, conexión 4G simulada)                           | Meta                       |
| --------------------------------------------------------------- | -------------------------- |
| Puntuación de rendimiento de Lighthouse en las páginas públicas | 90 o más                   |
| Tiempo hasta ver el contenido principal (LCP)                   | Menos de 2,5 s             |
| Estabilidad visual (CLS)                                        | Menos de 0,1               |
| JavaScript inicial de la página de inicio                       | Menos de 150 KB comprimido |

Si un cambio empeora estas cifras, la prueba falla y no se integra.

---

## 4. Vista general

```
                    ┌──────────────────────────── Next.js (web) ───────────────────────────┐
  Visitante ───────▶│ Sitio público (páginas del editor visual) · Catálogo · Alta y login  │
  Cliente  ───────▶│ Panel del cliente: servicios, vencimientos, facturas, métodos de      │
                    │ pago autorizados, renovación, soporte                                │
  Revendedor ─────▶│ Panel de revendedor: saldo prepagado, compras mayoristas, su cartera │
  Equipo   ───────▶│ Panel administrativo + editor visual del sitio                       │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │ HTTPS · cookie de sesión
                    ┌───────────────────────────────▼──────────────────── API (NestJS) ─────┐
                    │ Auth · Clientes · Catálogo · Suscripciones · Facturación · Pagos ·    │
                    │ Revendedores · Contenido del sitio · Soporte · Automatizaciones · IA ·│
                    │ Auditoría · Webhooks · OpenAPI                                        │
                    └───────┬─────────────────────────────────────────────┬────────────────┘
                            │                                             │
                     PostgreSQL (datos, auditoría,                 Adaptadores externos:
                     colas pg-boss, límites de uso)                pagos · correo · WhatsApp ·
                            ▲                                      IA · proveedores de servicio
                            │              ┌─────────────┐
                            └──────────────│ Trabajador  │  recordatorios, cobros autorizados,
                                           │  (pg-boss)  │  reintentos, suspensión, escalado,
                                           └─────────────┘  avisos de saldo bajo
```

### Estructura del monorepo

```
apps/
  web/        Next.js: sitio, panel del cliente, panel de revendedor, panel administrativo y editor
  api/        NestJS: API REST documentada
  worker/     Trabajador de colas y tareas programadas
packages/
  db/         Esquema Prisma, migraciones y datos de prueba
  shared/     Esquemas Zod, tipos, permisos y constantes
  ui/         Sistema de diseño NV (tokens, componentes)
  blocks/     Bloques del editor visual (cada uno con su esquema y su componente)
  adapters/   Interfaces y adaptadores: pagos, correo, WhatsApp, IA, proveedores
docs/         Arquitectura, API, despliegue, seguridad y operación
```

---

## 5. Modelo de datos

Todas las tablas llevan `id` (UUID), `creado_en` y `actualizado_en`. El dinero es `NUMERIC(12,2)` más un código de moneda. Nada contable se borra en cascada: los clientes y los registros financieros se **archivan**.

### 5.1 Identidad y acceso

| Entidad         | Campos clave                                                            | Notas                                                       |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `usuarios`      | correo (único), hash de contraseña, correo_verificado, rol, estado, 2FA | Rol: `admin`, `operador`, `ventas`, `revendedor`, `cliente` |
| `permisos_rol`  | rol, permiso                                                            | Matriz de la sección 6, en código y probada                 |
| `sesiones`      | usuario, hash del token, IP, dispositivo, expira, revocada              | El usuario ve y cierra sus sesiones                         |
| `tokens_un_uso` | usuario, tipo (verificar correo, recuperar, invitar), hash, expira      | Nunca se guarda el token en claro                           |

### 5.2 Clientes

| Entidad             | Campos clave                                                                                                      | Notas                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `clientes`          | usuario (opcional), nombre, documento, país, moneda preferida, estado, **revendedor o vendedor asignado**, origen | Un cliente puede existir antes de tener acceso al panel |
| `contactos_cliente` | cliente, tipo (correo, WhatsApp, teléfono), valor, verificado, consentimiento                                     | El consentimiento de mensajes queda registrado          |
| `notas_internas`    | cliente, autor, texto                                                                                             | No visibles para el cliente                             |
| `comunicaciones`    | cliente, canal, plantilla, estado de entrega, referencia externa                                                  | Historial de todo lo enviado                            |

### 5.3 Catálogo (genérico: servicio propio y distribuidor oficial)

| Entidad              | Campos clave                                                                                                                                                                                            | Notas                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `proveedores`        | nombre, **tipo** (`propio`, `distribuidor`), adaptador, estado, datos del acuerdo, **permite reventa**                                                                                                  | Si el acuerdo con un distribuidor prohíbe revender, sus planes no aparecen a los revendedores |
| `servicios`          | proveedor, nombre, descripción, imágenes propias, estado                                                                                                                                                | Lo que se comercializa                                                                        |
| `planes`             | servicio, nombre, precio, moneda, **duración**, beneficios, estado, visible, **disponibilidad** (ilimitada o por inventario), renovable, **revendible**, **precio mayorista** (por nivel de revendedor) | El precio vive solo aquí                                                                      |
| `historial_precios`  | plan, precio anterior, precio nuevo, autor                                                                                                                                                              | Auditoría de cambios de precio                                                                |
| `inventario_codigos` | plan, código **cifrado**, lote, estado (disponible, reservado, entregado, anulado)                                                                                                                      | Solo para distribuidores que entregan códigos o tarjetas                                      |

### 5.4 Suscripciones y entrega

| Entidad               | Campos clave                                                                                                                | Notas                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `suscripciones`       | cliente, plan, estado, inicio, vencimiento, próximo cobro, renovación automática, método de pago autorizado, **revendedor** | Máquina de estados de la sección 5.9                   |
| `eventos_suscripcion` | suscripción, tipo (alta, renovación, pausa, reanudación, cancelación, vencimiento, suspensión, recuperación), actor, motivo | Historial completo                                     |
| `entregas`            | suscripción, adaptador, estado, referencia externa, código entregado (referencia al inventario)                             | Lo que el adaptador del proveedor hizo para dar acceso |

### 5.5 Facturación y pagos

| Entidad                    | Campos clave                                                                                                                                              | Notas                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `facturas`                 | número correlativo, cliente, estado (borrador, emitida, pagada, vencida, anulada), subtotal, descuento, total, moneda, vencimiento                        | La numeración la genera el servidor       |
| `lineas_factura`           | factura, plan o concepto, cantidad, precio unitario, descuento                                                                                            |                                           |
| `cupones`                  | código, tipo (porcentaje o monto), valor, vigencia, usos máximos, planes aplicables, **creado por**                                                       | El descuento se calcula en el servidor    |
| `metodos_pago_autorizados` | cliente, pasarela, **token de la pasarela** (nunca datos de tarjeta), marca y últimos 4, **autorización del cliente** (fecha, IP, texto aceptado), estado | Base legal de los cobros automáticos      |
| `pagos`                    | factura, cliente, pasarela, **referencia generada por el servidor** (única), monto, moneda, estado, comprobante (archivo validado)                        |                                           |
| `intentos_cobro`           | pago, número de intento, resultado, código de error, próximo reintento                                                                                    | Registro de intentos fallidos             |
| `reembolsos`               | pago, monto, motivo, autor, estado                                                                                                                        |                                           |
| `conciliaciones`           | pago, fuente (extracto, webhook, manual), diferencia, conciliado por                                                                                      |                                           |
| `webhooks_recibidos`       | proveedor, id externo (único), firma válida, procesado                                                                                                    | El mismo aviso nunca se procesa dos veces |

### 5.6 Revendedores (modelo de precio mayorista con saldo prepagado)

El revendedor recarga saldo en NV, compra activaciones a **precio mayorista** con ese saldo y cobra a su cliente el precio que quiera. NV no interviene en el cobro entre el revendedor y su cliente.

| Entidad              | Campos clave                                                                                                  | Notas                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `revendedores`       | usuario, estado (solicitud, aprobado, suspendido), nivel, datos de facturación, aprobado por                  | Ser revendedor requiere que un admin apruebe la solicitud; ya no lo es cualquier usuario                                           |
| `niveles_revendedor` | nombre, requisitos (p. ej. volumen mensual)                                                                   | Cada nivel tiene su propia tabla de precios mayoristas                                                                             |
| `precios_mayoristas` | plan, nivel, precio, moneda, vigencia                                                                         | Solo para planes revendibles. Nunca por debajo del costo que tú definas por plan                                                   |
| `recargas_saldo`     | revendedor, monto, moneda, pago (reutiliza el flujo de `pagos`: comprobante, conciliación o pasarela), estado | El saldo solo sube cuando el pago está **confirmado**                                                                              |
| `movimientos_saldo`  | revendedor, tipo (recarga, compra, reembolso, ajuste), monto, saldo resultante, referencia, autor             | **Libro mayor**: el saldo es la suma de movimientos y nunca se edita a mano. Un ajuste manual exige motivo y queda en la auditoría |
| `compras_revendedor` | revendedor, plan, cliente final (opcional), precio mayorista aplicado, suscripción creada, estado             | Débito del saldo y creación de la suscripción en **una sola transacción**: si la entrega falla, el saldo se devuelve en el acto    |

Controles: bloqueo de fila al descontar saldo (dos compras simultáneas no pueden dejarlo en negativo), idempotencia por compra, aviso de saldo bajo y límite diario de compras configurable.

**Clientes finales del revendedor:** el revendedor puede registrarlos en su cartera para ver vencimientos y renovar. Los recordatorios de vencimiento le llegan **al revendedor**, que es quien cobra. Opcionalmente, el cliente final puede recibir los avisos, **sin precios de NV**.

### 5.7 Contenido del sitio (editor visual)

| Entidad            | Campos clave                                                                                                                    | Notas                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `paginas`          | ruta (`/`, `/planes`, `/nosotros`...), título, descripción SEO, estado                                                          |                                                              |
| `versiones_pagina` | página, número, **contenido** (lista de bloques en JSON validado), estado (borrador, publicada, archivada), autor, publicada en | Historial completo, con opción de volver a cualquier versión |
| `tema_sitio`       | colores, tipografías, logo, radios (dentro de los límites de la marca), versión                                                 |                                                              |
| `medios`           | archivo, tipo real verificado, tamaño, texto alternativo, subido por                                                            | Imágenes propias del sitio                                   |

### 5.8 Soporte, automatizaciones, IA y auditoría

| Entidad                             | Campos clave                                                                                | Notas                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `tickets`                           | cliente, categoría, prioridad, estado, asignado a, SLA                                      |                                              |
| `mensajes_ticket`                   | ticket, autor, texto, adjuntos, interno                                                     | Las respuestas internas no las ve el cliente |
| `automatizaciones`                  | tipo, activa, parámetros (días de aviso, reintentos, gracia), canal, plantilla              | Configurables desde el panel                 |
| `ejecuciones_automatizacion`        | automatización, objetivo, resultado, error                                                  |                                              |
| `ia_conversaciones` y `ia_mensajes` | usuario del equipo, mensajes, herramientas usadas                                           |                                              |
| `ia_acciones_propuestas`            | conversación, acción, parámetros, estado (pendiente, confirmada, rechazada), confirmada por | La IA propone y una persona confirma         |
| `auditoria`                         | actor (usuario, IA o sistema), acción, entidad, id, antes, después, IP, id de petición      | **Solo inserción**                           |

### 5.9 Ciclo de vida de una suscripción

```
 pendiente_pago ──pago confirmado──▶ activa ──llega el vencimiento──▶ en_gracia
      │                              │  ▲                                │   │
      │                        pausa │  │ reanudar               pago ok  │   │ se agota la gracia
      ▼                              ▼  │                                ▼   ▼
  cancelada ◀──────cancelar──────  pausada                          activa   suspendida
                                                                              │
                                     recuperación (pago de la deuda) ◀────────┘
                                                                              │ tras N días
                                                                              ▼
                                                                          vencida
```

Cada transición se hace en una transacción que comprueba el estado actual y escribe un `evento_suscripcion` y una fila de `auditoria`. Una transición no permitida devuelve un error.

### 5.10 Cobros y avisos (valores por defecto, configurables)

| Momento                                    | Acción                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 7, 3 y 1 días antes del vencimiento        | Recordatorio por correo (y por WhatsApp si lo activas)                                      |
| Día del vencimiento, con método autorizado | Aviso de cobro y **cobro a través de la pasarela oficial** con el token autorizado          |
| Día del vencimiento, sin método autorizado | Factura emitida con enlace o instrucciones de pago                                          |
| Cobro fallido                              | Registro del intento y reintentos a los 1, 3 y 5 días, con aviso al cliente                 |
| Fin de los 5 días de gracia sin pago       | **Suspensión controlada**: el adaptador del proveedor corta el acceso y se avisa al cliente |
| Suspensión de más de 3 días                | Se abre un ticket para el equipo (escalado del pago fallido)                                |
| Pago posterior                             | Recuperación: se reactiva el acceso y se registra el evento                                 |

Sin una autorización registrada en `metodos_pago_autorizados`, **el sistema nunca cobra de forma automática**.

---

## 6. Roles y permisos

| Permiso                                                   | Admin |        Operador/soporte         |   Ventas   |               Revendedor               |      Cliente      |
| --------------------------------------------------------- | :---: | :-----------------------------: | :--------: | :------------------------------------: | :---------------: |
| Ver métricas                                              |   ✓   |                ✓                | Las suyas  |               Las suyas                |         ·         |
| Ver y editar clientes                                     |   ✓   |                ✓                | Los suyos  |     Los suyos (sin datos de pago)      |     Su perfil     |
| Notas internas                                            |   ✓   |                ✓                |     ✓      |                   ·                    |         ·         |
| Gestionar catálogo y precios                              |   ✓   |                ·                |     ·      |                   ·                    |         ·         |
| Crear y renovar suscripciones                             |   ✓   |                ✓                |     ✓      | Para sus clientes (planes revendibles) | Renovar las suyas |
| Pausar o cancelar suscripciones                           |   ✓   |                ✓                |     ·      |                   ·                    |     Las suyas     |
| Registrar y conciliar pagos (incluidas recargas de saldo) |   ✓   |                ✓                |     ·      |                   ·                    |         ·         |
| Reembolsos y anulación de facturas                        |   ✓   |                ·                |     ·      |                   ·                    |         ·         |
| Crear cupones                                             |   ✓   |                ·                | Con límite |                   ·                    |         ·         |
| Aprobar revendedores, asignar nivel y precios mayoristas  |   ✓   |                ·                |     ·      |                   ·                    |         ·         |
| Recargar saldo y comprar a precio mayorista               |   ·   |                ·                |     ·      |                   ✓                    |         ·         |
| Editar y publicar el sitio (editor visual)                |   ✓   | Editar borradores, sin publicar |     ·      |                   ·                    |         ·         |
| Configurar automatizaciones                               |   ✓   |                ·                |     ·      |                   ·                    |         ·         |
| Tickets                                                   |   ✓   |                ✓                |    Ver     |          Los de sus clientes           |     Los suyos     |
| Asistente de IA                                           |   ✓   |                ✓                | Su cartera |                   ·                    |         ·         |
| Ver auditoría                                             |   ✓   |                ·                |     ·      |                   ·                    |         ·         |
| Gestionar usuarios del equipo                             |   ✓   |                ·                |     ·      |                   ·                    |         ·         |

La API comprueba los permisos en cada ruta, con el rol **leído de la base de datos** en cada petición y no del navegador.

---

## 7. Panel de revendedor

- **Inicio:** saldo disponible, compras del mes, clientes activos y próximos vencimientos de su cartera.
- **Recargar saldo:** instrucciones de pago o pasarela, subida del comprobante y estado de la recarga.
- **Comprar y activar:** catálogo de planes revendibles con **su** precio mayorista según su nivel. Al comprar se descuenta el saldo y se crea la activación para el cliente elegido.
- **Mis clientes:** su cartera, con servicios, vencimientos y renovación desde el saldo.
- **Movimientos:** extracto completo del saldo (recargas, compras, reembolsos, ajustes), exportable.
- **Soporte:** tickets propios y de sus clientes.
- **Solicitud para ser revendedor:** página pública con formulario; el admin aprueba o rechaza y asigna el nivel.

## 8. Editor visual del sitio

- **Qué se edita:** las páginas públicas (inicio, planes, nosotros, preguntas frecuentes, políticas) y el tema del sitio (colores, tipografías y logo, dentro de los límites de la marca NV).
- **Cómo:** arrastrar y soltar **bloques prediseñados** con vista previa en vivo en escritorio, tablet y móvil. Bloques iniciales: portada, planes destacados (conectados al catálogo real), beneficios, pasos, testimonios, preguntas frecuentes, llamada a la acción, texto enriquecido, imagen y banner.
- **Seguridad:** el editor guarda datos estructurados que se validan contra el esquema de cada bloque, **nunca HTML ni código libre**. Así no se puede inyectar código (el XSS de la versión anterior) y el diseño no se rompe.
- **Flujo:** borrador → vista previa → publicar. Cada publicación crea una versión y se puede volver a cualquier versión anterior con un clic. Quién publicó y qué cambió queda en la auditoría.
- **Velocidad:** al publicar, la página se regenera como HTML estático (sección 3). El editor no añade peso al sitio público.
- **Precios reales:** los bloques de planes leen el catálogo. Un precio nunca se escribe a mano en el editor.

## 9. Asistente de IA

- **Qué puede hacer:** responder consultas sobre clientes, pagos, vencimientos, revendedores y operaciones, generar resúmenes y redactar respuestas de soporte.
- **Cómo se conecta a los datos:** nunca con SQL libre. Usa un conjunto cerrado de herramientas de la API que se ejecutan **con los permisos del usuario que pregunta**.
- **Qué nunca ve:** las herramientas devuelven vistas sin contraseñas, tokens, datos de tarjeta, códigos de inventario ni secretos. Un filtro final de redacción se aplica antes de enviar nada al modelo.
- **Acciones:** lo que tiene efecto (renovar, pausar, aplicar un descuento, enviar un mensaje) solo crea una **acción propuesta**. Una persona con permiso la confirma, y la confirmación y la ejecución quedan en la auditoría con el actor "IA".
- **Costo:** con Claude, límite de gasto mensual configurable; con el modelo local, sin costo (sección 2.2).

---

## 10. Seguridad desde el diseño

- Contraseñas con Argon2id, verificación de correo obligatoria, recuperación con token de un solo uso y caducidad corta, y 2FA obligatorio para el equipo y los revendedores.
- Sesiones en cookie `httpOnly`, `Secure` y `SameSite`, con protección CSRF y revocación.
- Validación Zod en cada entrada, límites de tamaño y subida de archivos con verificación del tipo real.
- Límites de uso por IP y por cuenta en login, recuperación, pagos, recargas, compras de revendedor, IA y webhooks.
- Webhooks con firma verificada, marca de tiempo e idempotencia.
- Secretos solo en variables de entorno validadas al arrancar; la aplicación no arranca en producción con valores de ejemplo.
- Cifrado de campos sensibles (códigos de inventario, tokens de terceros) con AES-256-GCM e identificador de clave para poder rotarla.
- Cabeceras de seguridad: CSP estricta sin `unsafe-eval`, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`.
- Errores sin detalles internos hacia el cliente y logs con redacción de PII.
- Copias de seguridad automáticas y cifradas de PostgreSQL, con retención y una prueba de restauración documentada.
- Dependencias revisadas en CI y actualizadas.

---

## 11. Plan por fases

Cada fase termina con: qué funciona, cómo probarlo y qué queda pendiente.

| Fase                                  | Contenido                                                                                                                                                                                                                                                                   | Resultado visible                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **0. Cimientos**                      | Monorepo, CI con metas de velocidad, base de datos y migraciones, autenticación completa, roles y permisos, auditoría, sistema de diseño NV, datos de prueba                                                                                                                | Iniciar sesión con cada rol y ver su panel vacío con la identidad visual de NV |
| **1. MVP operativo**                  | Clientes, catálogo y planes, suscripciones (alta, renovación manual, pausa, cancelación), facturas, **pagos manuales con comprobante y conciliación**, cupones, soporte, panel del cliente, panel administrativo con métricas reales, sitio público básico, API documentada | El negocio opera de principio a fin con cobros manuales                        |
| **2. Revendedores y editor visual**   | Solicitud y aprobación de revendedores, panel de revendedor, niveles y precios mayoristas, saldo prepagado con libro mayor, compras y activaciones, editor visual con versiones y tema                                                                                      | Los revendedores venden desde su panel y tú editas el sitio sin tocar código   |
| **3. Automatizaciones**               | Trabajador con colas, recordatorios, avisos, suspensión controlada, recuperación, escalado a ticket, avisos de saldo bajo, adaptadores de correo y WhatsApp                                                                                                                 | Los avisos y suspensiones ocurren solos y quedan registrados                   |
| **4. Cobros automáticos autorizados** | Adaptador de la pasarela oficial elegida, flujo de autorización del cliente, cobro al vencimiento, reintentos, reembolsos, conciliación automática                                                                                                                          | Un cliente que autorizó su método paga sin intervención                        |
| **5. Asistente de IA**                | Herramientas con permisos, redacción de datos, acciones propuestas con confirmación, auditoría de la IA                                                                                                                                                                     | El equipo consulta y resume en lenguaje natural                                |
| **6. Proveedores y producción**       | Adaptadores de entrega para servicio propio y distribuidores, copias de seguridad, monitoreo, pruebas de carga y despliegue en el alojamiento gratuito                                                                                                                      | Listo para clientes reales                                                     |

**Repositorio:** la reconstrucción se hará en `CofferynDuque5/NV-Streaming` mediante PRs. Antes de sustituir el código anterior, lo marcaré con la etiqueta `legacy-v1` para que siga en el historial.

---

## 12. Decisiones que necesito de ti

| #   | Decisión                                                                           | Mi propuesta por defecto                                                     |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Tecnologías de la sección 2                                                        | Aprobarlas tal cual                                                          |
| 2   | **País y moneda de cobro** (define qué pasarela oficial admite cobros recurrentes) | Hasta saberlo: pagos manuales y sandbox                                      |
| 3   | Cómo gana el revendedor                                                            | **Decidido:** precio mayorista con saldo prepagado                           |
| 4   | Monedas del catálogo                                                               | Precio base en USD y visualización en moneda local con tasa configurable     |
| 5   | Plazos de avisos, reintentos y gracia                                              | 7/3/1 días de aviso, reintentos a 1/3/5 días, 5 días de gracia               |
| 6   | Alojamiento                                                                        | VM gratuita de Oracle Cloud y Cloudflare gratuito                            |
| 7   | Proveedor de IA                                                                    | Se decide en la fase 5 (Claude con límite de gasto, o modelo local gratuito) |
| 8   | Titularidad del logo NV                                                            | Si no es tuyo, diseño una identidad nueva                                    |
