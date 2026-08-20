# NV Streaming v1.0 — Informe final de release (auditoría CTO)

**Fecha:** 2026-08-08 · **Alcance:** stack Firebase (`site/` + `functions/`) + backend `whatsapp-agent` (Node/Postgres/IA). El stack paralelo **NestJS/Next.js queda fuera de v1.0**.

---

## Veredicto

> ## 🟡 READY con condiciones (Go condicional)
>
> El proyecto **se puede desplegar y operar** una vez completada la configuración manual. Las **dos vulnerabilidades críticas de seguridad están corregidas** y los ficheros de despliegue que faltaban ya están creados. **Queda un asunto de calidad conocido** (estados vacíos con datos de demostración) que no impide el arranque técnico pero sí conviene resolver antes de abrir al público general. No es un "NOT READY", pero **no es un "arranca sin mirar nada"**: hay configuración obligatoria.

Qué NO pude verificar desde este entorno (declarado explícitamente): **no hay Firebase CLI** aquí, así que **no desplegué ni validé las reglas con el emulador**, ni ejecuté la app en un navegador real, ni probé una transacción de pago end-to-end. Todo eso debes correrlo tú con la checklist de abajo.

---

## 1. Qué se auditó (verificado, con evidencia)

| Área | Resultado |
|---|---|
| Frontend `site/` | ✅ 0 rutas rotas · 0 TODO/FIXME reales · 0 código muerto · 10 `console.*` (diagnósticos, sin datos sensibles) |
| Estados vacíos | ❌ **No profesionales** (ver §3) — muestran demo incrustado con BD vacía |
| Datos ficticios/PII | ⚠️ Había cliente real + contraseñas en `seed.js` → **limpiados** en esta release |
| Reglas Firestore | ✅ **2 críticas + 4 riesgos corregidos** (ver `docs/SECURITY.md`) |
| Cloud Functions | ✅ Inventario y triggers mapeados; sintaxis válida |
| Backend + IA | ✅ `tsc --noEmit` sin errores; agente, tools, crons y pagos mapeados |
| Ficheros de deploy | ✅ **Creados** (`firebase.json`, `.firebaserc`, `firestore.indexes.json`, `storage.rules`) — antes faltaban todos |
| Secretos expuestos | ✅ Ninguno hardcodeado (la `apiKey` de Firebase es pública por diseño) |

---

## 2. Bloqueos resueltos en esta release
1. **Escalada de privilegios a admin** (regla `usuarios`) → corregida.
2. **`chats_soporte` público** → cerrado a autenticados.
3. **Faltaban todos los ficheros de configuración de Firebase** → creados; `firebase deploy` ya es posible.
4. **PII real y contraseñas en texto plano en `seed.js`** → reemplazadas por placeholders.
5. **4 riesgos de creación anónima / escritura abierta** → cerrados.
6. **Estados vacíos mostraban datos de demostración** (P1) → corregido en `bridge.js`: BD vacía ya no muestra datos falsos, sino estados vacíos.
7. **`migrate:prod` fallaba por no copiar `schema.sql`** (P5) → corregido con `copy:assets` + fallback.

---

## 3. Problemas restantes (lista completa)

| # | Severidad | Problema | Dónde | Estado / Recomendación |
|---|---|---|---|---|
| P1 | 🟠 Alta (UX/negocio) | **Estados vacíos no profesionales:** con Firestore vacío se veían arrays de demostración incrustados (Netflix, productos que no vendes: "Claude Pro", "NordVPN", reseñas y clientes falsos) como si fueran reales | `site/js/bridge.js` · `site/css/nv-fixes.css` · plantillas | ✅ **CORREGIDO.** Se eliminaron las guardas `if(length)`; con BD vacía las listas van vacías (cero datos falsos) y la lista principal de cada vista muestra una tarjeta/fila de "estado vacío" (p.ej. "Catálogo en preparación"), estilizada con CSS `[data-empty]`. Cubre index, catálogo, detalles, pagos, billetera, mi-cuenta, revendedor y alertas de admin. **Gancho `data-empty` verificado end-to-end con el runtime real (jsdom): aparece solo en la tarjeta vacía.** El pixel-perfect final conviene revisarlo en navegador. |
| P2 | 🟠 Alta (dinero) | **Auto-renovación extiende SIN cobrar** | `whatsapp-agent/.../renewals.service.ts:66` | Conecta el cobro real antes de renovar, o mantén `renovacion_automatica=false` |
| P3 | 🟠 Media (seguridad) | Backend con **CORS `*`** y **`GET /api/user/profile` sin auth** (lee PII por `userId`) | `whatsapp-agent` gateway/catalog routes | Restringir CORS y añadir auth antes de exponer |
| P4 | 🟡 Media | **Sin handoff humano real** en el agente (solo texto) | `whatsapp-agent/.../agent` | v1.1 si quieres soporte humano en el flujo |
| P5 | 🟢 Baja | `migrate:prod` fallaba (no copiaba `schema.sql` a `dist`) | build del backend | ✅ **CORREGIDO.** `build` ahora copia `schema.sql` a `dist/db` (`copy:assets`) y `migrate.ts` tiene fallback a `src/db`. Verificado: `migrate:prod` lee el schema y solo falla por conexión a BD. |
| P6 | 🟡 Baja | Dedup de webhooks **en memoria** (se pierde al reiniciar; falla con varias instancias) | `webhook.controller.ts` | Migrar a Redis/tabla si escalas |
| P7 | 🟡 Baja | `chats_soporte` sigue sin acotar por dueño (cualquier autenticado lee cualquier chat) | reglas | v1.1: añadir `uid` al doc y acotar |
| P8 | 🟡 Info | `tasa_bcv` por defecto hardcodeada (36.5) servida como "viva" | `config.js` / `platform-config.ts` | Actualízala; el backend puede sobreescribirla |

---

## 4. Riesgos
- **Dinero:** P2 (renovación sin cobro) es el de mayor impacto de negocio. Trátalo antes de activar auto-renovación.
- **Privacidad:** P3 expone PII de perfiles si el backend queda público sin proxy.
- **Reputación:** P1 (mostrar productos/clientes falsos) puede confundir a clientes reales el día 1.
- **Operativo:** si no defines los secretos de Functions, los webhooks quedan abiertos (documentado).
- **Irreversible:** perder `CREDENTIALS_ENC_KEY` inutiliza todas las credenciales cifradas.

---

## 5. Configuración pendiente (obligatoria antes de producción)
1. `site/js/firebase-config.js` → credenciales de **tu** proyecto Firebase + `DATABASE_ID="default"`.
2. `.firebaserc` → tu `PROJECT_ID`.
3. `site/js/config.js` → `api.base`, `imgbb.apiKey`, `whatsapp.numero`, `moneda.tasaVES`.
4. `whatsapp-agent/.env` → `DATABASE_URL`, `CREDENTIALS_ENC_KEY`, `OPENAI_API_KEY`, credenciales WhatsApp, `ADMIN_API_TOKEN`, datos de pago.
5. Secretos de Functions (`firebase functions:secrets:set …` ×5).
6. Crear base Firestore `default`, habilitar Auth Email/Password, plan Blaze.
7. Crear el primer usuario **admin** (doc `usuarios/{uid}.rol="admin"` desde consola).

## 6. Acciones manuales (además de la config)
- Aprobar la plantilla WhatsApp `vencimiento_perfil` (5 variables) en Meta.
- Registrar webhooks (WhatsApp Cloud API + Telegram/OTP).
- Construir el **puente de PagoMóvil** si quieres cobro automático (no incluido).
- Poner límite de gasto en OpenAI.
- Poner el backend detrás de HTTPS y proceso persistente (PM2/systemd/contenedor).

## 7. Comandos (referencia rápida)
```bash
# Firebase
npm install -g firebase-tools && firebase login && firebase use TU_PROJECT_ID
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET   # (×5, ver CLOUD-FUNCTIONS.md)
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,firestore:indexes,storage,functions

# Backend
cd whatsapp-agent && cp ../.env.example .env   # rellenar
npm install && npm run migrate && npm run build && npm start

# Frontend → subir contenido de site/ a tu public_html (o: firebase deploy --only hosting)
```

## 8. Archivos importantes
- `site/js/firebase-config.js`, `site/js/config.js` — configuración del frontend.
- `site/firestore.rules` — reglas endurecidas.
- `firebase.json`, `.firebaserc`, `firestore.indexes.json`, `storage.rules` — deploy.
- `whatsapp-agent/.env` (creado por ti a partir de `.env.example`).
- `functions/index.js` — Cloud Functions.

## 9. Credenciales necesarias (solo nombres, nunca valores)
`FIREBASE apiKey/authDomain/projectId/storageBucket` · `DATABASE_URL` · `CREDENTIALS_ENC_KEY` · `OPENAI_API_KEY` · `WHATSAPP_VERIFY_TOKEN` · `WHATSAPP_APP_SECRET` · `WHATSAPP_ACCESS_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` · `ADMIN_API_TOKEN` · `TELEGRAM_WEBHOOK_SECRET` · `TELEGRAM_BOT_TOKEN` · `WHATSAPP_API_TOKEN` · `AGENT_URL` · `AGENT_ADMIN_TOKEN` · `BINANCE_PAY_SECRET` · `PAGO_MOVIL_WEBHOOK_SECRET` · `SMTP_PASS` · `imgbb.apiKey`.

---

## 10. Checklist post-deploy

**Usuario:** ☐ registro ☐ login ☐ logout ☐ catálogo carga (del backend) ☐ añadir al carrito ☐ checkout ☐ pago (comprobante) ☐ renovación ☐ billetera ☐ mi-cuenta.
**Revendedor:** ☐ login ☐ dashboard ☐ clientes ☐ ventas ☐ comisiones ☐ retiro.
**Administrador:** ☐ login (usuario con `rol="admin"`) ☐ dashboard/KPIs ☐ servicios ☐ combos ☐ usuarios ☐ pedidos (aprobar) ☐ pagos (confirmar → renueva) ☐ renovaciones ☐ automatizaciones ☐ configuración/tasa.
**IA:** ☐ el agente responde por WhatsApp ☐ entrega credenciales solo si está pagada ☐ (handoff humano: NO disponible en v1.0).
**Automatizaciones:** ☐ recordatorio 9:00 ☐ renovaciones cada 6 h ☐ webhook de pago confirma.
**Seguridad:** ☐ un cliente NO puede ponerse admin ☐ un anónimo NO lee `chats_soporte` ☐ webhooks rechazan sin token.

## 11. Qué NO tocar
- El catch-all `match /{document=**}{ allow read, write: if false }` de las reglas.
- `DATABASE_ID="default"` (debe coincidir con tu base).
- `CREDENTIALS_ENC_KEY` una vez en uso (respáldala; no la cambies).
- El índice único de `suscripciones`/`pagos` en Postgres (garantiza no duplicar cuentas/pagos).
