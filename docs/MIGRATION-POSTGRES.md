# MIGRATION-POSTGRES.md — Salir de Firebase → PostgreSQL (backend Node propio)

Migración **por fases** del frontend fuera de Firebase, usando el backend Node existente (`whatsapp-agent`) sobre PostgreSQL gratuito (p.ej. **Neon** o **Railway**). No es un cambio de un tirón: cada fase se entrega y verifica.

> **Por qué Postgres + Node:** una sola fuente de verdad (dinero/stock relacional), sin depender de Firebase. La base gratuita recomendada es **Neon** (Postgres serverless, plan free).

---

## Estado de la migración

| Fase | Qué hace | Estado |
|---|---|---|
| **1. Auth** | Registro/login/sesión con JWT sobre Postgres (email + contraseña cifrada) | ✅ **HECHO y verificado** |
| **2a. CMS / contenido** | API Postgres del contenido de tienda (catálogo, ofertas, combos, carteleras, métodos de pago, FAQ, plataformas, config) | ✅ **HECHO y verificado** |
| **2b. Transaccional** | Pedidos + billetera (recargas, saldo, libro mayor) con transacciones atómicas | ✅ **HECHO y verificado** |
| 2c. Resto | Suscripciones (relacional) + soporte/notificaciones (document store) | ⏳ pendiente |
| **3. Rewire frontend** | `site/` deja de usar Firestore/Firebase Auth y consume la API REST | ✅ **HECHO y verificado** |
| **2c. Suscripciones + soporte** | Colecciones por-usuario (dueño/admin): suscripciones, tickets/chats, notificaciones | ✅ **HECHO y verificado** |
| **4. Arranque + cutover** | Crear admin, poblar contenido, guía Neon de punta a punta | ✅ **HECHO y verificado** |
| **5. OTP → backend** | Portadas las Cloud Functions de OTP al backend Node (Firebase eliminado del runtime) | ✅ **HECHO y verificado** |

> **Guía completa desde cero → producción sobre Postgres/Neon: `docs/DEPLOYMENT-POSTGRES.md`.**

---

## Fase 1 — Auth (COMPLETADA)

Se añadió un módulo de autenticación web al backend `whatsapp-agent`, unificando el modelo de usuario en la tabla `usuarios` (los usuarios web tienen `email` + `password_hash` e `id_whatsapp` NULL; los de WhatsApp, al revés).

**Novedades en el código:**
- `src/modules/auth/` — servicio, controlador, rutas y middleware.
- `src/db/repositories/users.repo.ts` — `findByEmail`, `findById`, `createWebUser`.
- `src/db/schema.sql` — columnas `password_hash`, `rol`, `saldo_billetera` + índice único de email (idempotente).
- `src/config/env.ts` — `JWT_SECRET`, `JWT_EXPIRES_IN`.
- `test/auth.test.ts` — smoke test con Postgres en memoria (pg-mem) + bcrypt/jwt reales.

**Endpoints:**
| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, nombre? }` | `{ usuario, token }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ usuario, token }` |
| GET | `/api/auth/me` | (header `Authorization: Bearer <token>`) | `{ usuario }` |
| POST | `/api/auth/logout` | — | `{ ok: true }` (el cliente descarta el token) |

**Seguridad:** contraseñas con **bcrypt** (nunca en claro); sesión con **JWT** firmado con `JWT_SECRET` (obligatorio en producción); email único sin distinguir mayúsculas; mismo mensaje de error para usuario inexistente y contraseña incorrecta (no filtra qué correos existen).

**Verificado:** `npm run typecheck` sin errores y `npm run test:auth` → 11/11 checks OK.

### Cómo probarlo (con tu Postgres)
```bash
cd whatsapp-agent
cp ../.env.example .env       # define DATABASE_URL (Neon) y JWT_SECRET
npm install
npm run migrate               # crea/actualiza el esquema (incluye las columnas de auth)
npm run build && npm start
# registro:
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"claveSegura123","nombre":"Tu Nombre"}'
# login:
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"claveSegura123"}'
# sesión (usa el token devuelto):
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <TOKEN>"
```

### Base de datos gratuita (Neon)
1. Crea un proyecto en https://neon.tech (free).
2. Copia la **connection string** y ponla en `whatsapp-agent/.env` como `DATABASE_URL` (incluye `?sslmode=require`).
3. `npm run migrate`.

---

## Fase 2a — CMS / contenido de tienda (COMPLETADA)

Las colecciones de contenido que el frontend sacaba de Firestore ahora viven en Postgres como **document store JSONB** (`cms_documentos`), con la misma forma `{ id, ...campos }` que espera el frontend.

**Novedades en el código:**
- `src/db/schema.sql` — tabla `cms_documentos (coleccion, doc_id, data JSONB, orden, activo, …)`.
- `src/db/repositories/cms.repo.ts` — `listar`, `obtener`, `upsert`, `borrar`.
- `src/modules/cms/` — controlador + rutas, con lista blanca de colecciones y control por rol.
- `src/modules/auth/auth.middleware.ts` — `requireRol('admin')`.
- `test/cms.test.ts` — smoke test con pg-mem (JSONB real).

**Endpoints:**
| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| GET | `/api/cms/:coleccion` | Público (contenido de tienda) / sesión (resto) | Lista de documentos |
| GET | `/api/cms/:coleccion/:id` | idem | Un documento |
| PUT | `/api/cms/:coleccion/:id` | **Solo admin** | Crear/actualizar |
| DELETE | `/api/cms/:coleccion/:id` | **Solo admin** | Borrar |

Colecciones públicas: `servicios_sistema`, `ofertas`, `combos_suscripciones`, `carteleras_estrenos`, `metodos_pago_config`, `tarjetas_header`, `preguntas_frecuentes`, `plataformas`, `configuracion_sistema`, `banners_posiciones`, `comentarios`. (No se pueden crear colecciones arbitrarias: hay lista blanca.)

**Verificado:** `npm run typecheck` sin errores y `npm run test:cms` → 10/10 OK (orden, JSONB round-trip, upsert sin duplicar, aislamiento entre colecciones, borrado).

**Ejemplo:**
```bash
# leer el catálogo (público)
curl http://localhost:3000/api/cms/servicios_sistema
# crear/actualizar un servicio (admin — necesita token de un usuario rol='admin')
curl -X PUT http://localhost:3000/api/cms/servicios_sistema/netflix \
  -H "Authorization: Bearer <TOKEN_ADMIN>" -H "Content-Type: application/json" \
  -d '{"nombre_display":"Netflix Premium","precio":12.99,"categoria":"STREAMING","orden":1}'
```

---

## Fase 2b — Transaccional: pedidos + billetera (COMPLETADA)

Lo que toca **dinero** se hace con tablas relacionales y **transacciones atómicas** (bloqueo de fila): nunca hay crédito sin asiento, ni doble crédito, ni saldo negativo.

**Novedades en el código:**
- `src/db/schema.sql` — tablas `pedidos`, `recargas_billetera`, `movimientos_billetera` (libro mayor). El saldo vive en `usuarios.saldo_billetera`.
- `src/db/repositories/wallet.repo.ts` — saldo, movimientos, crear/aprobar/rechazar recarga, **debitar** (aprobar y debitar son atómicos con `SELECT … FOR UPDATE`).
- `src/db/repositories/orders.repo.ts` — crear, listar, cambiar estado.
- `src/modules/commerce/` — controladores + rutas.
- `test/wallet.test.ts`, `test/orders.test.ts` — smoke tests con pg-mem.

**Endpoints:**
| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| POST | `/api/pedidos` | Cliente | Crea pedido (**precio del servidor**, no del cliente); si `metodo_pago:"billetera"` debita el saldo atómicamente |
| GET | `/api/pedidos/mios` | Cliente | Sus pedidos |
| GET | `/api/pedidos` | Admin | Todos (`?estado=`) |
| POST | `/api/pedidos/:id/estado` | Admin | Aprobar/rechazar/entregar |
| GET | `/api/wallet` | Cliente | Saldo + movimientos |
| POST | `/api/wallet/recargas` | Cliente | Solicitar recarga (queda pendiente) |
| GET | `/api/wallet/recargas/mias` | Cliente | Sus recargas |
| GET | `/api/wallet/recargas` | Admin | Recargas pendientes |
| POST | `/api/wallet/recargas/:id/aprobar` | Admin | **Acredita el saldo + asiento (atómico)** |
| POST | `/api/wallet/recargas/:id/rechazar` | Admin | Rechaza |

**Garantías de dinero verificadas** (`npm run test:wallet` → 11/11, `test:orders` → 8/8):
- Aprobar una recarga acredita **exactamente una vez**; **doble aprobación no duplica** el saldo.
- El **libro mayor cuadra** (cada movimiento guarda el `saldo_posterior`).
- Un **débito sin fondos se rechaza** y el saldo queda intacto.
- El **precio de compra lo pone el servidor** (busca el servicio en el CMS), no el cliente.
- La BD rechaza estados inválidos y precios negativos (CHECK).

---

## Fase 3 — Rewire del frontend (COMPLETADA)

El frontend `site/` ya **no usa Firebase**: lee datos y autentica contra la API REST del backend Postgres. Se hizo por la **capa `DB`**: al reimplementar `DB` (y `Auth`) manteniendo la misma interfaz, toda la app migró sin tocar vistas ni `bridge.js`.

**Novedades en el código (site/):**
- `js/services/nv-api.js` — cliente REST (CMS, auth con JWT en localStorage, pedidos, billetera).
- `js/core.js` — `DB` y `Auth` reescritos sobre la API (antes Firestore/Firebase Auth). `DB.watch` = fetch + polling (~15 s) ≈ tiempo real. `init()` hace health-check del backend.
- `js/services/data.service.js` — publica origen `"api"`.
- `js/services/admin.service.js` — aprobar pedido → `/api/pedidos/:id/estado`; aprobar recarga → `/api/wallet/recargas/:id/aprobar` (atómico en el servidor).
- **Firebase desconectado:** ningún HTML carga el SDK; ningún JS importa `firebase-config.js` (queda como archivo huérfano, se puede borrar).

**Configuración:** el frontend apunta al backend con **`NV_CONFIG.api.base`** en `site/js/config.js` (p.ej. `https://api.tudominio.com`). Si el backend no responde, el sitio degrada al seed local.

**Verificado en navegador real (Chromium) contra un backend que implementa el contrato:**
- `NVCore.online = true` (detecta el backend por `/health`).
- El **catálogo se pinta desde la API** (no del seed) — origen `"api"` en el Store.
- **Login por API/JWT** funciona: la sesión queda autenticada con el usuario del backend.
- **Cero errores de consola** relacionados con el rewire.

> Nota: `firebase.json`, `firestore.rules`, las Cloud Functions y `docs/FIREBASE.md` quedan como **legado**. Tras el cutover (Fase 4) puedes retirarlos. Las Cloud Functions de OTP (Telegram/WhatsApp) aún dependen de Firebase; si las quieres mantener, se pueden portar al backend Node en una fase posterior.

---

## Fase 2c — Suscripciones + soporte + notificaciones (COMPLETADA)

Colecciones cuyo acceso es **"el dueño o el admin"** (lo que hacían las reglas de Firestore) sobre un document store con dueño: `docs_usuario`.

**Novedades:**
- `src/db/schema.sql` — tabla `docs_usuario (coleccion, doc_id, uid_usuario, data JSONB…)`.
- `src/db/repositories/userdocs.repo.ts` — `mios`, `todos`, `crear`, `upsert`, `borrar`, `obtener`.
- `src/modules/userdocs/` — controlador + rutas + lista blanca (`suscripciones`, `tickets_soporte`, `chats_soporte`, `notificaciones`).
- Frontend: `js/services/nv-api.js` + `js/core.js` enrutan estas colecciones a `/api/mis` (cliente) o `/api/admin/docs` (admin) según el rol; `admin.service.js` responde soporte con el array completo (REST no tiene arrayUnion).
- `test/userdocs.test.ts` — smoke test de aislamiento.

**Endpoints:**
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/mis/:coleccion` | Cliente (solo lo suyo) |
| POST | `/api/mis/:coleccion` | Cliente (abrir ticket/chat) |
| GET | `/api/admin/docs/:coleccion` | Admin (todo) |
| GET/PUT/DELETE | `/api/admin/docs/:coleccion/:id` | Admin |

**Verificado:** `typecheck` + `npm run test:userdocs` → 7/7 (un cliente **solo ve lo suyo**, el admin ve todo, el dueño se conserva al responder), y en navegador (login → suscripciones desde `/api/mis`, abrir ticket → `POST /api/mis`).

---

## Fase 5 — OTP portado al backend (COMPLETADA · Firebase eliminado)

Las **Cloud Functions de OTP** (extraer códigos de Telegram/WhatsApp y guardarlos) se portaron al backend Node. **Ya no queda nada corriendo en Firebase.**

**Novedades:**
- `src/modules/otp/otp-parser.ts` — parser portado (idéntico a `functions/otp-parser.js`).
- `src/db/schema.sql` — tabla `codigos_verificacion` + índices.
- `src/db/repositories/codigos.repo.ts` — guardar, marcar obsoletos, listar, notificar.
- `src/modules/otp/otp.service.ts` — `procesarPayload`: parse → obsolescencia → guardar → alerta admin → reenvío al cliente (Telegram + fallback `wa.me`). Todo en un proceso (sin triggers de Firestore).
- `src/modules/otp/otp.controller.ts` + `otp.routes.ts` — webhooks + lectura.
- `src/config/env.ts` — `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_OTP_TOKEN`, `TELEGRAM_BOT_TOKEN`.
- `test/otp.test.ts` — smoke test (parser + obsolescencia).

**Endpoints (reemplazan a las Cloud Functions):**
| Antes (Firebase) | Ahora (backend Node) |
|---|---|
| `telegramWebhook` | `POST /otp/telegram` (valida `TELEGRAM_WEBHOOK_SECRET`) |
| `whatsappWebhook` | `POST /otp/whatsapp` (valida `WHATSAPP_OTP_TOKEN`) |
| `onCodigoCreado` (trigger) | inline en `procesarPayload` (marca obsoletos + reenvía código) |
| lectura de códigos | `GET /api/codigos` (operador/admin) |

**Verificado:** `typecheck` + `npm run test:otp` → 12/12 (extracción de código, detección de plataforma, saneo, y que **al llegar un código nuevo el anterior de esa plataforma queda obsoleto** sin afectar a otras).

> Tras portar esto, `functions/`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` y `docs/FIREBASE.md` quedan como **legado** y pueden borrarse. Reapunta tus webhooks de Telegram/WhatsApp a `https://api.tudominio.com/otp/telegram` y `/otp/whatsapp`.

---

## Fase 4 — Arranque de datos + cutover (COMPLETADA)

Scripts para dejar el sistema **arrancable de punta a punta** sobre Postgres, y la guía completa.

**Novedades en el código:**
- `src/scripts/crear-admin.ts` — crea o promueve el primer administrador (`npm run crear-admin -- <email> [password]`).
- `src/scripts/seed-cms.ts` — puebla el CMS desde un JSON idempotente (`npm run seed:cms`).
- `seed-cms.example.json` — datos de arranque (config, plataformas, métodos de pago, FAQ) + 2 servicios de EJEMPLO para reemplazar.
- `src/db/repositories/users.repo.ts` — `setRol` (promover a admin).
- `test/migrate.test.ts` — smoke test (pg-mem).

**Verificado:** `typecheck` + `npm run test:migrate` → 6/6 OK (crear admin, promover a admin case-insensitive, seed idempotente).

**Guía completa (Neon → migrate → admin → seed → run → frontend → pruebas):** ver **`docs/DEPLOYMENT-POSTGRES.md`**.

---

## Qué queda (opcional) — resumen honesto

- **Fase 2:** construir en el backend los endpoints que hoy el frontend resuelve contra Firestore (catálogo/CMS, pedidos, recargas, suscripciones, soporte, notificaciones…) y sus tablas Postgres. Es la fase más grande.
- **Fase 3:** reescribir la capa de datos del frontend (`site/js/services/data.service.js`, quitar `firebase-config.js`, cambiar el login a `/api/auth/*`).
- **Fase 4:** migrar datos existentes (si los hay) y apagar Firebase; primer admin (`rol='admin'`), guía de cutover.

Cada fase se entregará y verificará por separado, como esta.
