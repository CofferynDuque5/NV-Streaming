# TROUBLESHOOTING.md

## Firebase / Firestore

**`NOT_FOUND` / la app no lee datos de Firestore.**
La base debe llamarse **`default`** (nombrada), no `(default)`. Verifica `DATABASE_ID` en `site/js/firebase-config.js` y que `firebase.json → firestore.database` diga `"default"`. Crea la base con ese ID en Cloud Console.

**`firebase deploy` falla: "no project active".**
Ejecuta `firebase use TU_PROJECT_ID` y confirma `.firebaserc`.

**Las reglas rechazan todo / permiso denegado.**
El rol se lee de `usuarios/{uid}.rol`. El primer admin debes crearlo tú: crea el usuario en Auth, luego en Firestore pon su doc `usuarios/{uid}` con `rol: "admin"` (hazlo desde la consola de Firestore, no desde el cliente).

**El índice falta ("The query requires an index").**
`firebase deploy --only firestore:indexes`. Para consultas nuevas, usa el enlace que Firestore muestra en consola.

**El webhook de Functions responde a cualquiera.**
Faltan secretos: `firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET` (y `WHATSAPP_API_TOKEN`). Sin ellos el token se da por válido (modo dev).

## Frontend

**El catálogo/tablas se ven vacíos con un mensaje "en preparación".**
Es el **estado vacío correcto** (corregido en v1.0): con Firestore sin datos ya **no** se muestran productos ni clientes falsos. Carga tu catálogo real (o despliega el backend) y las listas se poblarán. Si en vez de eso ves productos como "Claude Pro"/"NordVPN", estás usando una copia antigua de `site/js/bridge.js`.

**Las subidas de imagen fallan.**
Falta `imgbb.apiKey` en `site/js/config.js` (de https://api.imgbb.com/).

**El asistente no responde / usa el link de WhatsApp.**
`api.base` en `config.js` no apunta a un backend vivo. Sin backend, el chat degrada a un enlace de WhatsApp (comportamiento esperado).

## Backend (`whatsapp-agent`)

**No arranca en producción: falta clave de cifrado.**
`CREDENTIALS_ENC_KEY` es obligatoria en prod. Genérala:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

**`npm run migrate:prod`.**
Corregido en v1.0: `npm run build` copia `schema.sql` a `dist/db/` (script `copy:assets`) y `migrate.ts` tiene fallback a `src/db`. Asegúrate de ejecutar `npm run build` antes de `migrate:prod`. (En dev sigue funcionando `npm run migrate`.)

**Postgres rechaza la conexión / SSL.**
El pool no fuerza SSL. En hosts gestionados añade `?sslmode=require` a `DATABASE_URL`.

**El agente no responde nada.**
`OPENAI_API_KEY` vacía → el agente no llama al modelo (solo avisa en logs). Ponla y revisa el límite de gasto en OpenAI.

**Endpoints admin de pago devuelven 503.**
Falta `ADMIN_API_TOKEN`.

**El webhook de WhatsApp no envía mensajes.**
Necesitas `WHATSAPP_ACCESS_TOKEN` (token permanente) y `WHATSAPP_PHONE_NUMBER_ID`, y la plantilla `vencimiento_perfil` aprobada en Meta.

## Seguridad a revisar antes de abrir al público
- Backend: `CORS` está en `*` y `GET /api/user/profile` no exige auth (lee PII por `userId`). Restríngelo tras un proxy o añade auth. (Ver `docs/SECURITY.md`.)
- La auto-renovación **extiende sin cobrar** (`renewals.service.ts`). No dependas de ella para el dinero.
- El dedup de webhooks es en memoria; con varias instancias usa Redis/tabla.
