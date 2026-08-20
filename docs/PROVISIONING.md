# Aprovisionamiento: compra web → entrega de streaming

Cierra la brecha entre el **storefront** (pedidos/billetera) y el **dominio de
streaming** (cuentas, suscripciones) que alimenta el **OTP** y las **renovaciones**.

## Flujo
Cuando un pedido queda **`aprobado`** (pago con billetera o aprobación del admin),
`provisionarPedido()` (`src/modules/commerce/provisioning.service.ts`):

1. Mapea el servicio del catálogo → **plataforma_id** (+ plan). El servicio del CMS
   (`servicios_sistema/{id}`) debe declarar **`plataforma_id`**; opcionalmente
   `plan_id` y `duracion_dias`. Si no declara `plataforma_id`, el pedido se marca
   **`no_aplica`** (p.ej. productos que no son de streaming) sin romper la compra.
2. Asigna **atómicamente** un perfil libre (`cuentas_streaming.estado='disponible'`,
   `FOR UPDATE SKIP LOCKED`) y crea una **suscripción activa** (`suscripciones`).
   Si el cliente trajo teléfono en el checkout, se fija su `id_whatsapp` (necesario
   para OTP/avisos).
3. Si **no hay stock** → cliente a **`cola_espera`** + **alerta al admin**.
4. Enlaza el pedido con la suscripción (`pedidos.suscripcion_id`, `provision_estado`)
   — esto es también la **guarda de idempotencia** (no se aprovisiona dos veces).

## Efecto sobre el OTP
La suscripción creada vincula **cuenta madre → cliente (`id_whatsapp`)**. Así, cuando
un código entra por esa cuenta (webhook OTP con `cuenta`=correo), `destinatarioPorCuenta`
resuelve al comprador y le reenvía el código. **Verificado end-to-end.**

## Requisito de datos
Para que un servicio sea aprovisionable automáticamente:
- `servicios_sistema/{id}` con **`plataforma_id`** (y opcional `plan_id`/`duracion_dias`).
- Un **plan activo** en `planes` para esa plataforma (si el servicio no trae `plan_id`).
- **Stock**: filas en `cuentas_streaming` con `estado='disponible'`.

## Estados posibles (`pedidos.provision_estado`)
`asignado` · `cola_espera` · `sin_plan` (no hay plan) · `no_aplica` (servicio no-streaming) · `error`.

## Tests
`npm run test:provisioning` (pg-mem): asigna perfil, crea suscripción activa, marca la
cuenta `asignada`, no reusa la misma cuenta, y sin stock → cola de espera + alerta.
