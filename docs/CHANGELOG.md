# CHANGELOG

## v1.0.0 — 2026-08-08 (Release candidate para producción)

Preparación de release del stack **Firebase (site + functions) + backend whatsapp-agent (Node/Postgres/IA)**. El stack paralelo NestJS/Next.js **no** forma parte de v1.0 (ver `docs/RELEASE-AUDIT.md`).

### Seguridad
- **[CRÍTICO] Corregida escalada de privilegios** en las reglas de Firestore: el dueño de `usuarios/{uid}` ya no puede modificar `rol`, `saldoBilletera`, `saldo`, `permisos`, `es_admin`, `isAdmin`. En `create`, el rol solo puede ser `cliente` y el saldo `0`.
- **[CRÍTICO] Cerrado `chats_soporte`**: era público total (`if true`); ahora exige autenticación.
- **[RISK] `flyers_revendedores`**: escritura restringida a admin.
- **[RISK] Creación anónima** en `pedidos`/`recargas`/`comentarios`/`tickets_soporte`/`notificaciones_admin`: ahora exige autenticación.

### Infraestructura / deploy
- **Añadidos** los ficheros que faltaban para poder desplegar: `firebase.json`, `.firebaserc` (plantilla), `firestore.indexes.json` (índice compuesto de `codigos_verificacion`), `storage.rules` (cerrado por defecto).
- Añadido `.env.example` consolidado (sin secretos).

### Limpieza de datos
- **Eliminados de `seed.js`**: un cliente real (nombre/email/UID de Firebase reales), contraseñas en texto plano (`password123`, `spot2026`, `disney2026`) y datos de contacto personales del titular → reemplazados por placeholders (`Cliente Demo`, `@example.com`, `DEMO-NO-USAR`, `pagos@tudominio.com`).
- Excluidos del paquete: `site/uploads/` (9.6 MB de mockups no referenciados), scripts de test, `node_modules`, backups.

### Documentación
- Añadida carpeta `docs/` completa: instalación, despliegue, Firebase, entorno, base de datos, functions, automatizaciones, agente de IA, seguridad, troubleshooting e informe de auditoría.

### Estados vacíos (BD sin datos) — corregido
- Reescrito `site/js/bridge.js`: se eliminaron las guardas `if(length)` que dejaban los arrays de demostración a la vista con Firestore vacío. Ahora, sin datos, las listas van **vacías** (cero datos falsos: se acabaron Netflix/"Claude Pro"/"NordVPN"/reseñas y clientes ficticios) y la lista principal de cada vista muestra una **tarjeta/fila de estado vacío** con la forma que la plantilla ya sabe pintar. Cubre: index, catálogo, detalles, pagos, billetera, mi-cuenta, revendedor y alertas de admin.
- **CSS de estado vacío:** se añadió el gancho `data-empty="{{ item._empty }}"` al root de las tarjetas/filas con placeholder (index, catálogo, billetera, mi-cuenta, revendedor) y reglas `[data-empty]` en `site/css/nv-fixes.css` (fondo atenuado, borde punteado, sin hover, oculta imagen/botón vacíos, texto centrado). La fila de tabla del revendedor se estiliza aparte (un `<tr>` no puede ser flex).
- **Verificado end-to-end** con el runtime real vía jsdom: `data-empty` se renderiza **solo** en la tarjeta vacía; las tarjetas con datos no lo llevan.

### Backend — `migrate:prod` corregido
- `build` ahora ejecuta `copy:assets`, que copia `src/db/schema.sql` a `dist/db/`. Además `src/db/migrate.ts` busca el schema con fallback a `src/db`. Verificado: `migrate:prod` encuentra el schema y solo depende ya de la conexión a la BD.

### Verificado
- `functions/index.js` y `otp-parser.js`: sintaxis válida.
- `whatsapp-agent`: `tsc --noEmit` sin errores; `npm run build` OK; `migrate:prod` lee el schema correctamente.
- `site/js/bridge.js` y `site/js/seed.js`: sintaxis válida (`node --check`).
- Frontend: 0 rutas rotas, 0 TODO/FIXME reales, 0 código muerto.
- *No verificado aquí (requiere navegador + Firebase):* render visual de los estados vacíos y flujos end-to-end.

### Correcciones de frontend (verificadas en navegador real con Chromium/Playwright)
- **Conversor de moneda — cálculo corregido.** `aplicarMoneda` (`js/modules/ux-fixes.js`) borraba el punto decimal al parsear (`9.99` → `999`), inflando los precios ~100× (Netflix mostraba **Bs 36.464** en vez de **Bs 365**). Ahora parsea el formato US correctamente (quita comas de millar, conserva el decimal). Verificado: $9.99 → Bs 365, $5.99 → Bs 219.
- **Layout roto — drawers tapados por el header.** El header tiene `z-index:1000` (`css/nv-fixes.css`) y los drawers (menú lateral y carrito) venían con `z-index:200/201`, así que su cabecera ("Mi Carrito", logo) quedaba **oculta bajo el header**. Se elevan por encima del header con reglas CSS. Verificado: la cabecera de ambos drawers ya es visible.
- **Buscador — envío funcional.** Además del filtrado en vivo al teclear, ahora la **lupa y Enter** envían la búsqueda: desde cualquier página llevan a `catalogo.html?q=…` (resultados a pantalla completa) y en el catálogo filtran en sitio. Antes la lupa/Enter en index no hacían nada visible. Verificado: "spotify" + Enter → catálogo filtrado.
- **Logo:** ver `docs/BRANDING.md` para poner tu logo real (es reemplazo de assets + `config.js`).

### Pendiente para v1.1
Ver `docs/RELEASE-AUDIT.md`. Lo principal restante: **handoff humano real** en el agente, **cobro real en auto-renovación**, endurecer **CORS/auth** del backend, y acotar `chats_soporte` por dueño.
