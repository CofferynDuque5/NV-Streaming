# FIREBASE.md — Configuración de Firebase

Todo lo que Firebase necesita, con veredicto por valor: **"⚙️ Debes configurarlo tú"** o **"✅ Ya viene resuelto en el código"**.

---

## 1. Valores del proyecto (`site/js/firebase-config.js`)

El frontend trae hoy las credenciales del proyecto de desarrollo **`nv-streaming`**. **Debes reemplazarlas por las de TU proyecto.**

> 🔑 **La `apiKey` de Firebase Web NO es un secreto.** Va pública en el cliente a propósito; la seguridad la imponen las **reglas de Firestore** y **Auth**, no ocultar la key. Por eso no está en `.env`: es correcto que esté en el código.

Archivo: **`site/js/firebase-config.js`** (líneas 21-24).

| Valor | Estado | Qué hacer | Dónde obtenerlo |
|---|---|---|---|
| `apiKey` | ⚙️ **Configúralo tú** | Reemplaza por el de tu proyecto | Consola Firebase → ⚙️ Configuración del proyecto → Tus apps → SDK de Firebase |
| `authDomain` | ⚙️ **Configúralo tú** | `TU_PROJECT_ID.firebaseapp.com` | Idem |
| `projectId` | ⚙️ **Configúralo tú** | El ID de tu proyecto | Idem |
| `storageBucket` | ⚙️ **Configúralo tú** | `TU_PROJECT_ID.firebasestorage.app` | Idem |
| `appId` | ✅ No requerido | El código no lo usa (solo lo necesitas si añades Analytics/FCM) | — |
| `messagingSenderId` | ✅ No requerido | Igual que arriba | — |
| `measurementId` | ✅ No requerido | Solo para Google Analytics; no se usa | — |

> ⚠️ **`DATABASE_ID = "default"`** (línea 29 del mismo archivo). Este proyecto usa una **base Firestore con nombre `default`** (sin paréntesis), no la base `(default)` por omisión. **Debes crear tu base de datos Firestore con el ID exacto `default`**, o cambiar esta constante al ID de tu base. Si no coinciden, verás errores `NOT_FOUND`.

Archivo `.firebaserc` (raíz):

| Valor | Estado | Qué hacer |
|---|---|---|
| `projects.default` | ⚙️ **Configúralo tú** | Cambia `REEMPLAZA_CON_TU_PROJECT_ID` por tu Project ID |

---

## 2. Servicios de Firebase a habilitar

| Servicio | ¿Necesario? | Configuración |
|---|---|---|
| **Firestore Database** | ✅ Sí | Crea la base con **ID `default`**, modo producción. Las reglas las despliegas tú (ver abajo). |
| **Authentication** | ✅ Sí | Habilita el proveedor **Email/Password** (el frontend usa login por email). Añade tu dominio en *Authorized domains*. |
| **Cloud Functions** | ✅ Sí | Requiere **plan Blaze** (las Functions llaman a APIs externas: Telegram, agente). Región **us-central1**. |
| **Storage** | ⚠️ Opcional | La app sube imágenes a **ImgBB**, no a Firebase Storage. `storage.rules` viene **cerrado** por defecto. Solo habilítalo si vas a usarlo. |
| **Hosting** | ⚠️ Opcional | Solo si sirves el frontend desde Firebase en vez de tu hosting. |
| **Analytics / Messaging** | ❌ No | No se usan. |

---

## 3. Región y APIs

| Ítem | Valor | Estado |
|---|---|---|
| Región de Functions | **us-central1** | ✅ Fijado en `functions/index.js:25`. Cámbialo ahí si quieres otra región. |
| API de Cloud Functions | Habilitar | Se activa sola al primer `firebase deploy` (plan Blaze). |
| API de Telegram Bot | Externa | El código llama a `api.telegram.org`; necesitas un bot (ver `docs/CLOUD-FUNCTIONS.md`). |

---

## 4. Secretos de Cloud Functions

**No van en `firebase-config.js` ni en `.env`.** Se cargan con la CLI (ver `docs/CLOUD-FUNCTIONS.md`):

```bash
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set WHATSAPP_API_TOKEN
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set AGENT_URL
firebase functions:secrets:set AGENT_ADMIN_TOKEN
```

| Secreto | Estado | Para qué |
|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | ⚙️ Configúralo tú | Valida el webhook de Telegram. **Si lo dejas vacío, el endpoint queda ABIERTO.** |
| `WHATSAPP_API_TOKEN` | ⚙️ Configúralo tú | Valida el webhook de WhatsApp del extractor de OTP |
| `TELEGRAM_BOT_TOKEN` | ⚙️ Configúralo tú | Token del bot de Telegram para enviar códigos |
| `AGENT_URL` | ⚙️ Configúralo tú | URL del backend `whatsapp-agent` (para el email de bienvenida) |
| `AGENT_ADMIN_TOKEN` | ⚙️ Configúralo tú | Debe coincidir con `ADMIN_API_TOKEN` del backend |

---

## 5. Extensiones

**Ninguna.** El proyecto no usa Firebase Extensions.

---

## 6. Índices de Firestore

`firestore.indexes.json` (raíz) trae **un índice compuesto** para `codigos_verificacion` (`cuenta_madre_id` + `obsoleto`), requerido por una consulta de las Functions. Se despliega con `firebase deploy --only firestore:indexes`. Si más adelante añades consultas `where + orderBy`, Firestore te dará en consola un enlace para crear el índice que falte.
