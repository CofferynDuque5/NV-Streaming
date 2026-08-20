# SECURITY.md — Modelo de seguridad y reglas

## 1. Cómo se decide el rol

El rol vive en el campo **`usuarios/{uid}.rol`** con valores `cliente` | `revendedor` | `operador` | `admin`. Las reglas lo leen con `get()`. **No** se usan custom claims.

`esAdmin()` → `rol == 'admin'` · `esOperador()` → `rol in ['admin','operador']` · `esDueno(uid)` → `request.auth.uid == uid`.

---

## 2. Matriz de acceso (Firestore, tras el endurecimiento de v1.0)

| Colección | Visitante (sin login) | Cliente autenticado | Revendedor | Admin | Cloud Functions |
|---|---|---|---|---|---|
| Catálogo/config pública (`servicios_sistema`, `ofertas`, `combos_suscripciones`, `carteleras_estrenos`, `plataformas`, `preguntas_frecuentes`, `metodos_pago_config`, `configuracion_sistema`) | **Lee** | Lee | Lee | Lee + **escribe** | Admin SDK (todo) |
| `comentarios` | Lee | Lee + crea | Lee + crea | + modera | — |
| `pedidos` | — | Lee **los suyos** + crea | Igual | Lee todos + gestiona | — |
| `recargas`, `recargas_billetera` | — | Crea (las suyas visibles) | Igual | Gestiona | — |
| `usuarios/{uid}` | — | Lee/edita **su** doc (sin tocar rol/saldo) | Igual | Todo | — |
| `suscripciones` | — | Lee | Lee | Escribe | — |
| `inventario`, `renovaciones_pendientes`, `historial_movimientos` | — | — | — | Todo | — |
| `chats_soporte`, `tickets_soporte`, `notificaciones` | — | Autenticado | Autenticado | Todo | — |
| `codigos_verificacion`, `plantillas_permisos` | — | — | — | Operador/Admin | Admin SDK escribe OTP |
| Cualquier otra | ❌ denegado | ❌ | ❌ | ❌ | Admin SDK |

---

## 3. Vulnerabilidades CORREGIDAS en esta release

Auditoría de reglas (2026-08). Ver `site/firestore.rules`.

| # | Severidad | Qué era | Corrección |
|---|---|---|---|
| 1 | 🔴 **CRÍTICA** | En `usuarios`, el dueño podía hacer `update` **sin restricción de campos** → ponerse `rol:'admin'` (escalada total) o editarse el `saldoBilletera`. | `update` del dueño ahora **bloquea** `rol`, `saldoBilletera`, `saldo`, `permisos`, `es_admin`, `isAdmin` vía `diff().affectedKeys().hasAny(...)`. En `create`, el rol solo puede ser `cliente` y el saldo `0`. |
| 2 | 🔴 **CRÍTICA** | `chats_soporte` con `allow read, create, update: if true` → **cualquiera sin login** leía/modificaba todos los chats (fuga de PII). | Ahora exige **autenticación**. (Recomendado v1.1: añadir `uid` al doc de chat y acotar por dueño.) |
| 3 | 🟠 Riesgo | `flyers_revendedores` escribible por **cualquier** autenticado. | Escritura solo **admin**. |
| 4 | 🟠 Riesgo | `pedidos`/`recargas`/`comentarios`/`tickets`/`notificaciones_admin` con `create: if true` (forjado/spam anónimo). | `create` ahora exige **autenticación**. |

---

## 4. Pendiente / recomendaciones

- **`chats_soporte` por dueño (v1.1):** hoy cualquier usuario autenticado puede leer cualquier chat. Requiere un cambio de esquema (campo `uid` en el doc) para acotar en reglas. Documentado como mejora.
- **No guardes secretos** en colecciones de lectura pública (`configuracion_sistema`, `metodos_pago_config`). Solo datos que el cliente puede ver.
- **Backend (`whatsapp-agent`):** endurece antes de exponer — CORS está en `*` y `GET /api/user/profile` no exige auth (lee PII por `userId` de query). Ver `docs/TROUBLESHOOTING.md` §Backend.
- **Secretos reales** (OpenAI, WhatsApp, DB, `CREDENTIALS_ENC_KEY`, pagos) **nunca** en git. Usa `.env` (ignorado) y `functions:secrets:set`.
- **`CREDENTIALS_ENC_KEY`**: guárdala y respáldala. Si la pierdes, las credenciales cifradas de PostgreSQL son irrecuperables.
