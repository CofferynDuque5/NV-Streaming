# DATABASE.md — Bases de datos

NV Streaming v1.0 usa **dos** almacenes:

- **Firestore** — contenido/CMS y datos del frontend (catálogo mostrado, usuarios, pedidos, soporte, notificaciones, OTP).
- **PostgreSQL** — núcleo del backend (catálogo con stock real, suscripciones, pagos, **credenciales cifradas**).

---

## A) Firestore

### Qué debes crear manualmente
- La **base de datos Firestore** con **ID `default`** (¡no la `(default)` por defecto! Ver `docs/FIREBASE.md`).
- **Desplegar las reglas y los índices** (no los crea la app):
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```

### Qué crea el sistema automáticamente
- Las **colecciones y documentos** se crean solos cuando la app/So Back Office escriben. **No necesitas crearlas a mano.**
- El proyecto **arranca con la base vacía** y funciona (ver caveat de estados vacíos en `docs/RELEASE-AUDIT.md`).
- Datos iniciales opcionales: el Back Office tiene un botón **"Completar base de datos"** que siembra las colecciones de configuración/estructura (`configuracion_sistema`, `plataformas`, etc.). Los datos de demostración de clientes/pedidos que incluye son **placeholders** (`Cliente Demo`, `@example.com`, precios de ejemplo) — úsalo solo si quieres una base de arranque; para producción real, carga tus propios datos.

### Colecciones (26)
Catálogo/config: `servicios_sistema`, `ofertas`, `combos_suscripciones`, `carteleras_estrenos`, `banners_posiciones`, `tarjetas_header`, `metodos_pago_config`, `preguntas_frecuentes`, `configuracion_sistema`, `plataformas`, `respuestas_rapidas`.
Comercio: `pedidos`, `recargas`, `recargas_billetera`, `historial_movimientos`, `suscripciones`, `inventario`, `renovaciones_pendientes`.
Usuarios: `usuarios`.
Soporte/notif: `comentarios`, `chats_soporte`, `tickets_soporte`, `notificaciones`, `notificaciones_admin`, `flyers_revendedores`.
OTP: `codigos_verificacion`, `plantillas_permisos`.
Editor: `paginas_layout`.

`configuracion_sistema` tiene 3 documentos de ID fijo: `parametros` (incl. `tasa_bcv`, `whatsapp`), `tema_interfaz`, `plantillas_mensajes`.

### Qué NO tocar
- El **catch-all** `match /{document=**} { allow read, write: if false; }` al final de las reglas — deja denegado todo lo no declarado.
- El ID de base `default` (debe coincidir con `firebase-config.js`).

---

## B) PostgreSQL (backend `whatsapp-agent`)

### Crear el esquema
```bash
cd whatsapp-agent
npm run migrate          # aplica src/db/schema.sql (idempotente)
```
> ⚠️ Usa `npm run migrate` (tsx sobre `src`). El script `migrate:prod` puede fallar porque `tsc` no copia `schema.sql` a `dist/`. Ver `docs/TROUBLESHOOTING.md`.

### Tablas
| Tabla | Función |
|---|---|
| `usuarios` | Clientes por `id_whatsapp` (E.164, único) |
| `planes` | Catálogo de precios (fuente de verdad de precios) |
| `cuentas_streaming` | Cuentas proveedoras; **`contrasena_cifrada` (cifrada en reposo)**, pin, perfil, estado |
| `suscripciones` | Vínculo cliente↔cuenta; **índice único parcial: una sola suscripción activa por cuenta** |
| `pagos` | Pagos; **índice único `id_externo` anti-duplicado de PSP** |
| `cola_espera` | Lista de espera (pagó pero sin stock) |
| `alertas_admin` | Alertas operativas (p.ej. sin stock) |

Extensión `pgcrypto` (UUIDs). Triggers mantienen `actualizado_en`. Esquema idempotente (`IF NOT EXISTS`).

### Cifrado de credenciales
`src/utils/crypto.ts`: **AES-256-GCM**, formato `iv:tag:ciphertext` (base64). Clave desde **`CREDENTIALS_ENC_KEY`** (32 bytes). **En producción la app no arranca si falta.** Guárdala y respáldala: si la pierdes, las contraseñas cifradas son irrecuperables.
