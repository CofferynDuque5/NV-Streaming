# NV Streaming — Plataforma (frontend + backend cliente)

Ecosistema premium de acceso a servicios digitales. Frontend en **HTML/CSS/JS
plano** (sin build) con una capa de **backend de cliente sobre Firebase**
construida con **módulos ECMAScript nativos** (`type="module"`).

---

## ✏️ Editar la marca, assets, WhatsApp y sonidos — un solo archivo

**`js/config.js`** (`window.NV_CONFIG`) centraliza todo lo editable:

- **Marca / logo**: `marca.logo` (texto o `imagen`), `marca.nombre`.
- **Rutas de assets**: `assets.base`, `assets.sounds` (todo cuelga de `assets/`).
- **Colores** de la paleta NV.
- **WhatsApp** del botón flotante: `whatsapp.numero`, `whatsapp.mensaje`,
  `whatsapp.habilitado`.
- **Sonidos**: `sonido.pistas.*` → archivos en `assets/sounds/`
  (`click/success/notify/error.wav`), `sonido.habilitado`, `sonido.volumen`.
- **Animaciones**: `animacion.*` (velocidades/curvas).
- **Flags**: activar/desactivar FAB, sonidos, modales.

Se carga **antes** del runtime, así que cualquier página, módulo o plantilla lee
de aquí. Para cambiar el logo o el número de WhatsApp, edita solo este archivo.

**Microinteracciones** (`js/modules/`): `ui-feedback.js` (spinner + modales de
confirmación/éxito/error, `window.NVUI`), `sound.js` (feedback auditivo,
`window.NVSound`), `whatsapp-fab.js` (botón flotante). El checkout usa modal de
confirmación → spinner → modal de éxito, con limpieza garantizada del DOM.

---

## ▶ Cómo ejecutar

Los módulos ES exigen **http(s)** (no funcionan desde `file://`). Sirve la
carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8080        # → http://localhost:8080
# o:  npx serve .
```

Abre `http://localhost:8080/index.html`.

> Para desplegar: sube el contenido de esta carpeta a Firebase Hosting, Vercel,
> Netlify o cualquier hosting estático. No hay paso de compilación.

---

## 🔥 Firebase — configuración y el fix de la base de datos

Credenciales ya integradas en `js/firebase-config.js`:

- **API Key:** `AIzaSyBEPWU3lQroBe-djdjRrEu41ukoIymQ2eY`
- **Project ID:** `nv-streaming`

### ⚠️ El fix de la base `default`
La base de datos en la consola está creada con el ID **`default`** (sin
paréntesis). El SDK de Firebase, por omisión, apunta a **`(default)`** (con
paréntesis), lo que genera una ruta de API inexistente (errores `NOT_FOUND`).
Se resuelve pasando el ID explícitamente como **segundo argumento**:

```js
const db = getFirestore(app, "default");   // js/firebase-config.js
```

### Reglas de Firestore
Publica `firestore.rules` (incluido) para permitir las lecturas públicas del
catálogo y las escrituras de pedidos/recargas. Ajusta según tu política.

### Completar la base de datos
El seed canónico de las **24 colecciones** del blueprint vive en `js/seed.js`.
Para escribirlas en Firestore:

- Entra al **Back Office** (`admin.html`) y pulsa **⛁ Completar base de datos**
  (abajo a la izquierda). Es **idempotente** (usa `setDoc` con id fijo).
- O desde la consola del navegador: `NVSeeder.sembrarTodo()`.

---

## 🧩 Arquitectura (Documento 1 · Especificación técnica)

Flujo oficial de datos: **Firestore → Services → Normalizers → Store → Componentes**.

```
js/
  firebase-config.js     Init + getFirestore(app,'default') [fix] · import dinámico del SDK
  core.js                NVCore v12.1 — gateway único (Bus · Store · DB · Auth · Utils · Theme)
  normalizers.js         Contratos homogéneos por colección (resuelve inconsistencias §5)
  seed.js                Dataset canónico de las 24 colecciones (seed + fallback offline)
  seeder.js              Completar la BD en Firestore (idempotente)
  bridge.js              Mapea el Store a la forma de cada plantilla + window.NV + acciones
  bootstrap.js           Arranque por página (type="module")
  services/
    data.service.js      Carga inicial + snapshots (onSnapshot SIN orderBy, orden en cliente)
    commerce.service.js  Carrito (localStorage) · moneda multi-tasa · checkout · billetera
    admin.service.js     Aprobaciones (runTransaction) · CRUD · tema · renovaciones · soporte
```

- **NVCore** (`window.NVCore`) es la única puerta a Firebase. Ningún componente
  toca Firestore directamente.
- **Store**: fuente única de estado, con suscripciones y eventos (`store:changed`).
- **DB**: colas reactivas **sin `orderBy`** en servidor y orden en cliente para
  anular `FAILED_PRECONDITION` por índices compuestos faltantes (§4.1).
- **Modo degradado**: si el SDK/CDN no está disponible, todo cae al **seed
  local** — la UI nunca queda vacía ni rota.

### Propagación de tema (No-Code)
`configuracion_sistema/tema_interfaz` se escucha en vivo y repinta las variables
CSS (`--neon-*`, `--bg-*`, `--font-*`, `--speed-*`) a 0 ms, inyectando las
fuentes de Google Fonts dinámicamente.

### Aislamiento financiero
La aprobación de recargas usa `runTransaction`: lee el `saldoBilletera` **en
servidor**, suma el `monto` normalizado y escribe atómicamente saldo + estado +
`historial_movimientos`.

---

## 🔑 Módulo OTP — Automatización de credenciales y mensajería

Recepción automática de códigos de verificación (Telegram/WhatsApp), asociación
a la cuenta/perfil y notificación al cliente.

- **Panel:** `credenciales.html` (enlace “🔑 Credenciales OTP” en el admin).
  Tabla **en vivo** de códigos entrantes (Pendiente/Usado/Expirado con countdown),
  **simulador de recepción** (prueba el parser sin bot) y **asignación masiva**.
- **Parser:** `js/modules/otp-parser.js` — extrae código (4–8 dígitos) + plataforma.
- **Servicio:** `js/services/credentials.service.js` — procesa, asocia a
  `cuenta_madre` (`inventario`), obsoletiza el código previo, registra en
  `codigos_verificacion` (expira +10 min), RBAC vía `plantillas_permisos`.
- **Webhook real (servidor):** `../functions/` — Cloud Functions
  `telegramWebhook` / `whatsappWebhook` + trigger `onCodigoCreado`. Ver
  `../functions/README.md`.
- **Colecciones nuevas:** `plataformas`, `codigos_verificacion`,
  `plantillas_permisos` (incluidas en el seed y el seeder).

Modelo de datos (adaptado del spec MySQL → Firestore):
`plataformas` = `servicios_sistema` · `cuentas_madre` = `inventario` ·
`perfiles` = `suscripciones` · `codigos_verificacion` = colección nueva.

## 🖥 Páginas

`index` (home) · `catalogo` · `detalles` · `carrito` · `pagos` · `mi-cuenta` ·
`billetera` · `auth` · `admin` (Back Office) · `revendedor`
(`reseller-workspace.html` redirige aquí) · `editor` · `ser-revendedor` ·
`quienes-somos` · `politicas`.

Todos leen del catálogo real y comparten header, carrito lateral, menú móvil,
chat de soporte y footer.

### `window.NV` — API de cliente
`NV.cart`, `NV.checkout`, `NV.wallet`, `NV.moneda`, `NV.catalog`, `NV.admin`,
`NV.core`, `NV.addToCart(id)`, `NV.toast(msg)`.

---

## ✅ Pruebas (desde la raíz del repo)

```bash
node test.mjs            # render de cada página (con la capa de datos activa)
node verify.mjs          # interacciones base (mega-menú, carrito, admin…)
node verify-backend.mjs  # NVCore, Store, carrito, moneda multi-tasa, seeder
```
