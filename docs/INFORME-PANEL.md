# Informe del panel NV Streaming: qué tiene y qué falta

Fecha: 23 de octubre de 2026 · Rama `feat/planes-rev-recarga-agente-estrenos` · Verificado contra el código y sobre backend + PostgreSQL reales.

El informe cubre los tres paneles (administración, cliente y revendedor), el editor visual y el backend que los sostiene. La segunda parte lista lo que conviene arreglar, mejorar o incluir, ordenado por impacto.

---

## Parte 1 · Lo que tiene hoy

### 1.1 Panel de administración (`admin.html` → "NV OS" + herramientas)

Portada "NV OS" con KPIs reales (ventas aprobadas, pedidos pendientes, usuarios, suscripciones activas, recargas pendientes, stock, planes), reparto de roles, actividad reciente, 20 módulos con conteos reales y paleta de comandos. Cada tile abre la herramienta real como capa; "Volver al panel" y ESC regresan. Acceso estricto: solo rol admin; cualquier otro rebota al login.

| Sección | Tipo | Qué muestra | Qué se puede hacer |
|---|---|---|---|
| **Dashboard** | panel | KPIs, serie de 14 días de ventas/pedidos, top servicios por ingresos, roles, actividad | Solo lectura |
| **Notificaciones** | tabla | Alertas: `nuevo_pedido`, `sin_stock`, `cola_atendida`, `estreno` con badge de no leídas en el menú | Marcar leída · Marcar todas |
| **Pedidos** | tabla | Cliente, servicio, precio, método, comprobante (visor), estado, **entrega** (cuenta asignada / en cola / manual), fecha | Aprobar (confirmación + resultado real) · Rechazar · Marcar entregado. Transiciones válidas forzadas por el servidor |
| **Recargas** | tabla | Usuario, monto, método, comprobante, estado, fecha | Aprobar (acredita saldo) · Rechazar, ambas con confirmación del monto |
| **Suscripciones** | tabla | Cliente, servicio, perfil, estado, precio, vence | Solo lectura |
| **Usuarios** | tabla | Nombre, email, rol, saldo | Editar: rol (cliente/revendedor/admin), saldo, % comisión |
| **Revendedores** | tabla | Código, clientes, ventas, comisión total, pendiente | Solo lectura |
| **Servicios** | CRUD (CMS) | Nombre, categoría, precio cliente, precio revendedor, stock, activo | Crear/editar/borrar: id, nombre, categoría, descripción, precios, stock, imagen y logo (biblioteca ImgBB), activo, destacado |
| **Combos** | CRUD | Nombre, precio público, activo | Nombre, descripción, precio público y revendedor, banner, servicios incluidos, activo |
| **Categorías / Plataformas** | CRUD | Nombre, categoría, orden | Alta/edición/borrado |
| **Métodos de pago** | CRUD | Banco, titular, teléfono, activo | id, banco, titular, cédula/RIF, teléfono, correo Zelle, Binance, instrucciones, orden, activo |
| **Cartelera** | CRUD | Título, plataforma, activo | Estrenos con imagen de fondo y CTA; al crear uno nuevo dispara el agente de estrenos (aviso + WhatsApp al admin) |
| **Ofertas** | CRUD | Nombre, %, precio oferta, activa | Oferta por servicio; **código de cupón** canjeable en el carrito |
| **FAQs** | CRUD | Pregunta, orden | Pregunta/respuesta/orden |
| **Planes revendedor** | CRUD | Plan, precio, periodo, destacado | Lo que se muestra en "Hazte revendedor" |
| **Inventario** | CRUD | Plataforma, correo, perfil, estado (`disponible` / `asignada`) | Crear cuenta (contraseña cifrada AES-256-GCM) · Borrar. Al crear, **atiende la lista de espera** automáticamente |
| **Planes** | CRUD | Plataforma, plan, precio, días, activo | Alta/edición/borrado (precio y duración por plataforma) |
| **Configuración** | formulario | Empresa, WhatsApp de soporte, tasa BCV, moneda base, garantía | Guardar |
| **Editor visual** | enlace | Abre `editor.html` | — |

### 1.2 Editor visual (`editor.html`)

Edición en vivo de la tienda real dentro de un iframe (textos por slot, bloques ocultos, acento, fondo), guardar borrador / publicar en PostgreSQL por página, páginas Home / Catálogo / Detalle / Checkout / Mi cuenta / 404. Pestaña **Medios**: biblioteca real de imágenes (subir vía backend a ImgBB con la clave en `.env`, ver, copiar URL, usar como logo, quitar). Panel "Logo de la marca" con subir / elegir de la biblioteca.

### 1.3 Panel del cliente (`mi-cuenta.html`)

Pestañas: Dashboard, **Mis Servicios** (estadísticas reales; panel **Mis accesos** con correo, contraseña oculta con Mostrar/Copiar, perfil, PIN, vencimiento; estado de cada pedido: pendiente de validar, en lista de espera, rechazado), Wallet (saldo, recargas, movimientos), Facturación (compras reales), Seguridad, Revendedor (acceso al panel si tiene el rol), Configuración. Se refresca solo cada 20 s, así ve la activación en cuanto el admin aprueba.

### 1.4 Panel del revendedor (`reseller-workspace.html`)

Dashboard (enlace de referido con código, comisión total / pendiente / disponible / pagada, ventas, ingresos, clientes, saldo, nivel Bronce→Plata con umbral real, actividad), Mis Clientes (referidos con pedidos y total), Comisiones (por venta, %, estado), Retiros (pasa comisiones disponibles a su billetera), Enlaces de venta. En la tienda ve y paga la tarifa `precio_rev`; el servidor también se la cobra.

### 1.5 Tienda y flujo de compra

Catálogo, megamenú, ficha, carrito (se reprecifica con el catálogo vigente), checkout con billetera (activación instantánea) o pago manual con comprobante (pendiente → aprobación del admin → cuenta asignada), lista de espera sin stock, credenciales en Mi cuenta. Definido en `docs/FLUJO-COMPRA.md` y cubierto por la prueba `e2e-flujo`.

### 1.6 Backend (Node + PostgreSQL)

Auth JWT (email/contraseña y Google), roles cliente / revendedor / admin (+ `operador` en OTP), CMS genérico con lista blanca pública, pedidos con precio fijado por el servidor, billetera atómica, aprovisionamiento con `FOR UPDATE SKIP LOCKED`, cola de espera, comisiones por referido, inventario cifrado, alertas admin, biblioteca de medios, agente WhatsApp con IA (OpenAI) y entrega de credenciales por chat, OTP por Telegram/WhatsApp, recordatorios y renovaciones por cron, webhooks Binance Pay / Pago Móvil (flujo `/pagos` de WhatsApp), rate limit en login y chat, cabeceras de seguridad, manejador central de errores, `restart: unless-stopped` en Docker.

---

## Parte 2 · Qué arreglar, mejorar o incluir

### 2.1 Arreglos (cosas que hoy no funcionan o engañan)

| # | Qué pasa | Dónde | Propuesta |
|---|---|---|---|
| A1 | **"Ver" comprobante en Recargas no abre**: es un enlace a una URL `data:` y el navegador bloquea abrirla en pestaña nueva | `admin-app.js` sección recargas | Usar el mismo visor que Pedidos |
| A2 | **Pestaña Seguridad del cliente es decorativa**: "Cambiar contraseña", "2FA" y "Sesiones activas · Chrome · Windows" no están conectados y el dato de sesión es inventado | `mi-cuenta.html` | Implementar cambio de contraseña (no existe endpoint), quitar 2FA y sesiones hasta que existan |
| A3 | **No hay "olvidé mi contraseña"** ni cambio de contraseña: un cliente que la pierde no puede recuperarla | `auth.routes.ts` | Endpoint de reset por correo (requiere SMTP) o por código OTP vía WhatsApp (ya existe infraestructura OTP) |
| A4 | **Doble fuente de stock**: `servicios.stock` (número manual en Servicios) y el inventario real (`cuentas_streaming`). La tienda ya usa el real; el campo manual confunde | Servicios → campo Stock | Quitar el campo o mostrarlo solo lectura calculado del inventario |
| A5 | **Métodos de pago sin campo PayPal** aunque el checkout lo lee (`correo_paypal`) | Métodos de pago → campos | Añadir el campo y logo opcional |
| A6 | **Comprobantes en base64 dentro de la base de datos** (pedidos y recargas): crecen la BD y pesan en cada listado | `pedidos.comprobante`, `recargas_billetera.comprobante` | Subirlos a la biblioteca de medios (ImgBB) y guardar solo la URL |
| A7 | **Rechazar un pedido ya aprobado no está permitido**, y liberar una cuenta asignada solo se puede borrando | Inventario / Pedidos | Acción "Liberar cuenta" en Inventario y "Cancelar suscripción" en Suscripciones |
| A8 | **Webhooks de Binance Pay / Pago Móvil no confirman pedidos web**: trabajan sobre la tabla `pagos` del flujo de WhatsApp | `psp.service.ts` | Buscar también el pedido web por referencia/monto y aprobarlo (aprovisiona solo) |
| A9 | **Renovación automática y el chat web extienden suscripciones sin cobrar** (hay un aviso en el propio código) | `renewals.service.ts`, `message-handler.ts` | Cobrar de billetera o pedir pago antes de extender |
| A10 | **Sin correo al cliente** por pedidos web aunque hay SMTP configurado para facturas del flujo `/pagos` | — | Enviar confirmación/activación por correo además de WhatsApp |
| A11 | El número de WhatsApp es único por usuario: si dos cuentas usan el mismo, la segunda **no recibe avisos** y el agente no la reconoce (falla en silencio) | `users.repo.ts` | Avisar en el checkout y permitir corregirlo en Configuración |
| A12 | `normalizarServicio` del agente quita guiones bajos: `disney_espn` → no coincide | `tools.ts` | Normalizar igual que el id del catálogo |
| A13 | Código muerto: rama admin en `bootstrap.js`, `perfilPrivado` en ficha lee una colección inexistente, `admin.service.js` arma un wa.me al número propio | varios | Eliminar |

### 2.2 Mejoras del panel de administración

| # | Mejora | Valor |
|---|---|---|
| M1 | **Buscador, filtros y paginación** en todas las tablas (hoy cargan todo y sin filtro) | Imprescindible cuando pasen de ~100 pedidos |
| M2 | **Cola de espera visible**: pestaña con quién espera qué (el endpoint `/api/admin/cola-espera` ya existe) y botón "Atender ahora" | Evita clientes olvidados |
| M3 | **Resumen de stock por plataforma** (endpoint `/api/admin/cuentas/resumen` ya existe): disponibles / asignadas / en espera, con alerta de stock bajo configurable | Reposición a tiempo |
| M4 | **Inventario**: editar cuenta (correo, contraseña, PIN, perfil), ver contraseña con confirmación, importar CSV masivo, varios perfiles por cuenta madre | Hoy es solo crear y borrar, uno a uno |
| M5 | **Suscripciones con acciones**: pausar, cancelar, extender días, reasignar cuenta, ver credenciales, filtrar por vencimiento | Hoy es solo lectura |
| M6 | **Usuarios**: columna WhatsApp, buscar por email, bloquear/desbloquear, resetear contraseña, ver sus pedidos y accesos desde la fila | Soporte más rápido |
| M7 | **Pedidos**: filtro por estado por defecto "pendientes", nota interna, botón "Escribir al cliente" (wa.me con el número real), exportar CSV | Operación diaria |
| M8 | **Soporte**: las tablas `tickets_soporte` y `chats_soporte` existen pero el admin no tiene pantalla para responder | Cierra el canal de ayuda |
| M9 | **Pagos del flujo WhatsApp** (`/pagos/pendientes`) y **códigos OTP** (`/api/codigos`) sin pantalla en el panel | Hoy solo por API |
| M10 | **Configuración ampliada**: logo y tema (hoy en el editor), textos de mensajes WhatsApp, umbral de stock bajo, días de recordatorio, estado de integraciones (WhatsApp, OpenAI, ImgBB, SMTP: configurado / no) | Un solo sitio para operar |
| M11 | **Registro de auditoría**: quién aprobó qué y cuándo (hoy la "actividad" se deriva de pedidos y recargas) | Trazabilidad |
| M12 | **Rol operador** (ya existe en OTP): acceso al panel solo a Pedidos, Recargas e Inventario, sin Configuración ni Usuarios | Delegar sin dar todo |
| M13 | **Reportes**: ventas por periodo y servicio, margen (precio cliente − coste de la cuenta), comisiones pagadas, exportable | Decisiones de negocio |
| M14 | **Combos**: precio sugerido = suma de servicios, validación de que los servicios existan, imagen desde biblioteca | Menos errores de carga |
| M15 | Tabla de Pedidos se desborda en pantallas medianas (columna de acciones recortada) | Visual |

### 2.3 Mejoras para el cliente

| # | Mejora |
|---|---|
| C1 | Recuperar y cambiar contraseña (ver A2/A3) y editar WhatsApp en Configuración |
| C2 | **Renovar desde Mi cuenta** con un clic (misma plataforma, cobro por billetera o pago manual) y aviso dentro de la web cuando falten 3 días |
| C3 | **Soporte desde la web**: abrir ticket / chat ligado al pedido (tablas ya existen) |
| C4 | Descargar comprobante/recibo de cada compra (PDF) |
| C5 | Notificaciones dentro de la web (campana) además de WhatsApp: pedido aprobado, cuenta asignada, vencimiento |
| C6 | Checkout: guardar WhatsApp y nombre del perfil para no volver a pedirlos; mostrar tiempo estimado de validación según horario |
| C7 | Página de estado de un pedido compartible (enlace) para seguimiento |

### 2.4 Mejoras para el revendedor

| # | Mejora |
|---|---|
| R1 | **Retiro real**: hoy "Retiros" pasa comisiones a su billetera; falta solicitar pago a su cuenta bancaria/Binance con aprobación del admin (tabla `retiros_comision` existe) |
| R2 | Comprar **a nombre de un cliente** (ingresar su WhatsApp) y que el acceso llegue al cliente final |
| R3 | Materiales de venta reales (flyers, textos) desde el panel; hoy la colección `flyers_revendedores` está vacía y sin pantalla de carga en el admin |
| R4 | Dominio del enlace de referido tomado de la configuración (hoy fijo `nvstreaming.com`) |
| R5 | Niveles con % de comisión automático según ventas (hoy el % lo fija el admin a mano) |

### 2.5 Plataforma, seguridad y operación

| # | Mejora |
|---|---|
| P1 | **Pasarela automática** para tarjeta/cripto (Binance Pay ya tiene adaptador; falta ligarlo a pedidos web, ver A8) |
| P2 | Rate limit también en `/api/pedidos`, `/api/wallet/recargas` y `/api/admin/*`; CORS restringido al dominio real en producción |
| P3 | Copias de seguridad automáticas de PostgreSQL y rotación de logs (Docker) |
| P4 | Panel de salud: estado de backend, BD, WhatsApp, OpenAI, ImgBB, último cron ejecutado |
| P5 | Pruebas automatizadas en CI (ya existen `npm test` y los E2E de Playwright; falta ejecutarlos en GitHub Actions) |
| P6 | PWA / app instalable y modo móvil del admin (hoy el admin es solo escritorio) |
| P7 | Idioma/moneda: la tienda ya convierte USD→VES; falta configurar más monedas desde el panel |
| P8 | Rotar la clave de OpenAI expuesta y mover `JWT_SECRET` a un valor fuerte en producción (ya está documentado) |

---

## Prioridad sugerida

1. **Semana 1 (arreglos que afectan ventas):** A1, A3+A2, A4, A5, M1, M2, M3, M15.
2. **Semana 2 (operación diaria):** M4, M5, M6, M7, A6, A7, C1, C2.
3. **Semana 3 (ingresos y crecimiento):** A8+P1, R1, R2, C3, M8, M13.
4. **Después:** M10–M12, C4–C7, R3–R5, P2–P7.
