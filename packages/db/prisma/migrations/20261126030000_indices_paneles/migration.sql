-- Índices para las búsquedas de los paneles (admin, revendedor, cliente) por
-- servicio, plan, cliente, suscripción, usuario, nivel, factura y cuenta.
-- Solo agrega índices: no cambia ni borra datos.
CREATE INDEX IF NOT EXISTS "planes_servicio_id_idx" ON "planes"("servicio_id");
CREATE INDEX IF NOT EXISTS "suscripciones_plan_id_idx" ON "suscripciones"("plan_id");
CREATE INDEX IF NOT EXISTS "compras_revendedor_cliente_id_idx" ON "compras_revendedor"("cliente_id");
CREATE INDEX IF NOT EXISTS "compras_revendedor_suscripcion_id_idx" ON "compras_revendedor"("suscripcion_id");
CREATE INDEX IF NOT EXISTS "compras_revendedor_plan_id_idx" ON "compras_revendedor"("plan_id");
CREATE INDEX IF NOT EXISTS "tickets_suscripcion_id_idx" ON "tickets"("suscripcion_id");
CREATE INDEX IF NOT EXISTS "conversaciones_whatsapp_cliente_id_idx" ON "conversaciones_whatsapp"("cliente_id");
CREATE INDEX IF NOT EXISTS "notificaciones_usuario_id_idx" ON "notificaciones"("usuario_id");
CREATE INDEX IF NOT EXISTS "revendedores_nivel_id_idx" ON "revendedores"("nivel_id");
CREATE INDEX IF NOT EXISTS "lineas_factura_plan_id_idx" ON "lineas_factura"("plan_id");
CREATE INDEX IF NOT EXISTS "cobros_automaticos_suscripcion_id_idx" ON "cobros_automaticos"("suscripcion_id");
CREATE INDEX IF NOT EXISTS "entregas_factura_id_idx" ON "entregas"("factura_id");
CREATE INDEX IF NOT EXISTS "canjes_cupon_cliente_id_idx" ON "canjes_cupon"("cliente_id");
CREATE INDEX IF NOT EXISTS "consultas_codigo_cuenta_id_idx" ON "consultas_codigo"("cuenta_id");
