# DEPLOYMENT-POSTGRES.md — Desde cero → producción (sin Firebase)

Guía completa para arrancar NV Streaming sobre **PostgreSQL + backend Node**, con base gratuita **Neon**. No omite pasos. Al final tienes: catálogo, login, carrito/checkout, billetera y panel admin funcionando sobre Postgres.

Arquitectura ahora:
- **Frontend** `site/` (estático) → tu `public_html`. Habla con el backend por `NV_CONFIG.api.base`.
- **Backend** `whatsapp-agent/` (Node/Express) → un host con Node (Render/Railway/VPS).
- **Base de datos** PostgreSQL (Neon free).

---

## Paso 1 — PostgreSQL gratis (Neon)
1. Crea cuenta en https://neon.tech y un proyecto.
2. Copia la **connection string** (algo como `postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
3. Guárdala; irá en `DATABASE_URL`.

## Paso 2 — Configurar el backend
```bash
cd whatsapp-agent
cp ../.env.example .env
```
Edita `whatsapp-agent/.env` y define como MÍNIMO:
```env
NODE_ENV=production
DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require   # el de Neon
JWT_SECRET=<genera uno>          # node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
CREDENTIALS_ENC_KEY=<genera uno> # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET: cualquier valor si aún no usas WhatsApp
WHATSAPP_VERIFY_TOKEN=nv-token
WHATSAPP_APP_SECRET=nv-secret
```

## Paso 3 — Crear el esquema en Postgres
```bash
npm install
npm run migrate        # crea todas las tablas (usuarios, cms_documentos, pedidos, recargas, movimientos…)
```

## Paso 4 — Crear tu primer administrador
```bash
npm run crear-admin -- tu@correo.com TuContraseñaSegura123
# (si el email ya existe, en vez de crearlo lo promueve a admin)
```

## Paso 5 — Poblar el contenido inicial (catálogo, config, pagos, FAQ)
```bash
cp seed-cms.example.json seed-cms.json
# EDITA seed-cms.json con TUS servicios, precios, métodos de pago (titular/correo), tasa BCV, WhatsApp…
npm run seed:cms       # idempotente: puedes re-ejecutarlo cuando cambies el JSON
```
> El JSON de ejemplo trae datos estructurales + 2 servicios marcados “EJEMPLO” para que los reemplaces. También puedes cargar/editar contenido desde el panel admin una vez dentro.

## Paso 6 — Arrancar el backend
```bash
npm run build
npm start              # escucha en el puerto PORT (3000 por defecto)
```
En producción, ponlo tras HTTPS y como proceso persistente (PM2/systemd/contenedor), en un dominio p.ej. `https://api.tudominio.com`.

## Paso 7 — Apuntar el frontend al backend
Edita `site/js/config.js`:
```js
api: { base: "https://api.tudominio.com", ... }   // ← tu backend (con o sin /api, ambos valen)
```
Sube el contenido de `site/` a tu `public_html` (o `firebase deploy --only hosting` si aún usas Firebase Hosting solo para servir estáticos).

## Paso 8 — Verificación de humo
```bash
# el backend responde
curl https://api.tudominio.com/health                 # {"ok":true}
# el catálogo sale de Postgres
curl https://api.tudominio.com/api/cms/servicios_sistema
# login del admin creado en el paso 4
curl -X POST https://api.tudominio.com/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"TuContraseñaSegura123"}'
```
En el navegador: abre la web → el catálogo debe mostrar lo que cargaste (no el seed) → inicia sesión → añade al carrito → checkout.

---

## Checklist de cutover (dejar Firebase atrás)
- [ ] Backend desplegado y `/health` responde por HTTPS.
- [ ] `DATABASE_URL`, `JWT_SECRET`, `CREDENTIALS_ENC_KEY` definidos.
- [ ] `npm run migrate` ejecutado (tablas creadas).
- [ ] Admin creado (`crear-admin`) y login OK.
- [ ] Contenido cargado (`seed:cms` con tu JSON real) — catálogo visible en la web.
- [ ] `site/js/config.js` → `api.base` apunta al backend.
- [ ] `site/` subido a tu hosting; catálogo, login, carrito, billetera y admin probados.
- [ ] (Opcional) Retirar lo de Firebase: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `site/js/firebase-config.js` y `docs/FIREBASE.md` quedan como legado y se pueden borrar.

## Qué sigue siendo de Firebase (decisión aparte)
Las **Cloud Functions de OTP** (Telegram/WhatsApp para extraer códigos) aún viven en Firebase (`functions/`). Si las usas, mantén ese proyecto Firebase solo para eso, o pórtalas al backend Node en una fase posterior. El resto de la plataforma ya no depende de Firebase.

## Notas
- Si el backend no responde, el frontend **degrada al seed local** (no se rompe), pero sin datos reales. Revisa `api.base`, HTTPS y CORS.
- El backend actual tiene CORS abierto (`*`) para desarrollo: restríngelo a tu dominio antes de abrir al público (ver `docs/SECURITY.md`).
