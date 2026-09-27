# Flujo del ecosistema: de la tienda a la cuenta entregada

Este documento define, etapa por etapa, qué pasa desde que un visitante entra al `index.html` hasta que recibe la cuenta que compró. Todo lo descrito está implementado y verificado con backend + PostgreSQL reales (prueba `e2e-flujo`: index → carrito → checkout → pedido → validación → asignación → credenciales en Mi cuenta).

## Actores y estados

| Actor | Dónde actúa | Qué decide |
|---|---|---|
| Visitante / Cliente | `index.html`, `catalogo.html`, `detalles.html`, `carrito.html`, `pagos.html`, `mi-cuenta.html` | Qué compra, cómo paga, dónde recibe el acceso |
| Revendedor | Mismas páginas (con tarifa `precio_rev`) + `reseller-workspace.html` | Compra para revender; cobra comisión por referidos |
| Admin | `admin.html` → Pedidos, Recargas, Inventario, Notificaciones | Valida pagos, carga stock, aprueba |
| Backend | `whatsapp-agent` (Node + PostgreSQL) | Precio real, aprovisionamiento, cifrado, avisos |

**Estados del pedido** (`pedidos.estado`): `pendiente` → `aprobado` → `entregado`, o `pendiente` → `rechazado`. Las transiciones son las únicas permitidas (la API responde 409 a cualquier otra).

**Estado de entrega** (`pedidos.provision_estado`, lo escribe el backend al aprobar):

| Valor | Significado | Qué ve el cliente |
|---|---|---|
| `asignado` | Se tomó una cuenta del inventario y se creó la suscripción activa | Correo, contraseña, perfil y PIN en Mi cuenta |
| `cola_espera` | Pago aprobado pero sin stock: quedó en lista de espera | "En lista de espera (sin stock)"; se activa solo al cargar stock |
| `sin_stock` | Solo con billetera: sin stock → saldo devuelto y pedido rechazado | "Sin stock · saldo devuelto" |
| `no_aplica` / `sin_plan` | Servicio sin plataforma/plan de inventario (p. ej. recargas de juegos) | "Entrega manual por WhatsApp" |

## Etapa 1 · Descubrir (index / catálogo / ficha)

- `index.html` y `catalogo.html` muestran el catálogo real (`servicios_sistema` del CMS) con el precio según rol: `precio` para clientes, `precio_rev` para revendedor/admin. El megamenú por categoría sale del mismo catálogo.
- Cada tarjeta lleva `data-nv-id="<id_servicio>"`. Clic en la tarjeta → `detalles.html?id=<id>`. Clic en "Agregar" → carrito (`bridge.js` → `Cart.addServicio`).
- El stock mostrado ("Disponible / Agotado") es el inventario real (`cuentas_streaming` en estado `disponible`). Sin inventario cargado, todo aparece agotado.

## Etapa 2 · Carrito

- Vive en `localStorage` (`nv_cart_v1`) y se **reconcilia** con el catálogo al cargar y al iniciar sesión: precios vigentes por rol, nombres al día, y se eliminan servicios que ya no existen.
- Cupones: ofertas del admin (Ofertas → campo "Código de cupón" + "Descuento %"). No hay códigos fijos en el código.
- Salidas: cajón lateral → "Ir al Checkout" (`pagos.html`), o `carrito.html` → "Proceder al pago".

## Etapa 3 · Checkout (`pagos.html`)

Requisitos: sesión iniciada (si no, se ofrece ir a `auth.html?next=pagos.html` y volver). Se pide el WhatsApp del cliente (se guarda en `usuarios.id_whatsapp`; es el canal de avisos).

Métodos (los datos de cobro salen de `metodos_pago_config`):

1. **Saldo de billetera** → descuento atómico del saldo y **activación instantánea** (Etapa 5 sin intervención del admin). Si el saldo no alcanza, se ofrece recargar. Si no hay stock, se devuelve el saldo automáticamente.
2. **Pago Móvil / Binance / Zelle / Transferencia / PayPal** → el cliente sube el **comprobante** (captura, hasta 8 MB, se guarda en el pedido) y el pedido queda `pendiente` hasta que el admin lo valide. Sin comprobante se puede registrar, pero se avisa que tardará más.

Por cada unidad del carrito se crea un pedido en `POST /api/pedidos` (los combos se descomponen en sus servicios). El **precio lo fija el servidor** desde el CMS según el rol; el cliente nunca manda el precio.

Resultado que ve el cliente (honesto, según la respuesta real del servidor):

- "¡Listo! Tu servicio está activo" (billetera con stock) → redirige a Mi cuenta.
- "Pedido registrado, pendiente de validar el pago" (métodos manuales) → redirige a Mi cuenta.
- "Sin stock por ahora, saldo devuelto" (billetera sin stock).
- Error claro si falla (sesión expirada, saldo insuficiente, comprobante muy grande, sin conexión). Nunca se crea un pedido simulado.

## Etapa 4 · Validación (admin)

- Cada pedido manual genera una alerta `nuevo_pedido` en **Notificaciones** del admin (con servicio, monto, método y si trae comprobante).
- En **Pedidos** el admin ve cliente, servicio, precio, método, botón **Ver** (abre la captura), estado y entrega. Acciones: **Aprobar** (con confirmación) o **Rechazar**.
- Recargas de billetera: **Recargas** → Aprobar acredita el saldo (con confirmación del monto).

## Etapa 5 · Aprovisionamiento (automático al aprobar)

`provisionarPedido` (backend), idempotente:

1. Plataforma de inventario = `plataforma_id` del servicio o, si no lo tiene, el propio `id_servicio` cuando existe un plan para él (el seeder crea un plan por servicio, así el catálogo sale aprovisionable de fábrica).
2. Toma una cuenta `disponible` de `cuentas_streaming` de esa plataforma (`FOR UPDATE SKIP LOCKED`: nunca se entrega la misma cuenta dos veces), la marca `asignada` y crea la **suscripción activa** (`suscripciones`, vence según `duracion_dias` del plan).
3. Sin stock → `cola_espera` + alerta `sin_stock` al admin. **Al cargar una cuenta nueva en Inventario, la cola se atiende sola** por orden de llegada: se asigna, se enlaza el pedido, se marca `atendido` y se avisa.
4. Comisión al revendedor que refirió al comprador (`comisiones`), idempotente.
5. Aviso por WhatsApp al cliente (si hay `WHATSAPP_ACCESS_TOKEN` configurado): "tu X está activo, perfil N; tus datos están en Mi cuenta".

## Etapa 6 · Entrega (cliente)

- `GET /api/mis/accesos` devuelve las suscripciones del cliente con la cuenta asignada. La **contraseña se descifra en el servidor solo si la suscripción está activa, pagada y vigente**; si no, viaja `credenciales: null` con el motivo (vencida, pausada, cancelada…).
- `mi-cuenta.html` → **Mis servicios** muestra el panel **Mis accesos**: correo, contraseña (oculta, con Mostrar/Copiar), perfil y PIN, vencimiento y estado; debajo, el estado de cada pedido abierto (pendiente de validar, en lista de espera, rechazado). Se refresca cada 20 s y al volver a la pestaña, así el cliente ve la activación en cuanto el admin aprueba.
- Alternativa por WhatsApp: el agente de IA (`obtenerCredencialesPerfil`) entrega los mismos datos si el número coincide con `usuarios.id_whatsapp` (requiere `OPENAI_API_KEY`).

## Etapa 7 · Vida de la suscripción

- Recordatorios de vencimiento y renovaciones: crons (`CRON_ENABLED=on`) avisan por WhatsApp `REMINDER_DIAS_ANTES` días antes.
- Al vencer, Mi cuenta deja de mostrar las credenciales y ofrece renovar (nueva compra del mismo servicio).

## Manual de operación (lo que hace el dueño)

1. **Cargar inventario**: Admin → Inventario → Nuevo: plataforma (= id del servicio, p. ej. `netflix`), correo, contraseña, perfil, PIN. Cada fila = un perfil vendible. Sin inventario, las compras aprobadas quedan en lista de espera.
2. **Configurar cobros**: Admin → Métodos de pago (titular, teléfono, banco, correo Zelle/Binance…). Es lo que ve el cliente en el checkout.
3. **Cada día**: Notificaciones → pedidos y recargas nuevos → Pedidos: Ver comprobante → Aprobar/Rechazar. Recargas: Aprobar.
4. **Avisos automáticos**: poner `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en `.env` para que el cliente reciba el WhatsApp de activación. Sin ellos, el cliente igual ve todo en Mi cuenta.

## Endpoints implicados

| Paso | Endpoint |
|---|---|
| Catálogo público | `GET /api/cms/servicios_sistema`, `GET /api/catalog` |
| Crear pedido | `POST /api/pedidos` (auth) |
| Mis pedidos / accesos | `GET /api/pedidos/mios`, `GET /api/mis/accesos` (auth) |
| Validar | `POST /api/pedidos/:id/estado` `{estado}` (admin; 409 si la transición no es válida) |
| Inventario | `GET/POST /api/admin/cuentas` (POST atiende la cola de espera) |
| Billetera | `POST /api/wallet/recargas`, `POST /api/wallet/recargas/:id/aprobar` (admin) |
| Alertas admin | `GET /api/admin/alertas` |

## Lo que NO hace todavía (honesto)

- No hay pasarela con tarjeta: los pagos manuales dependen de la validación del admin. Los webhooks de Binance Pay / Pago Móvil existen (`/pagos/webhook/:proveedor`) pero trabajan sobre la tabla `pagos` del flujo de WhatsApp, no sobre los pedidos web.
- No se envía correo al cliente por pedidos web (solo WhatsApp y Mi cuenta).
- Rechazar un pedido ya aprobado no está permitido (habría que liberar la cuenta a mano desde Inventario).
