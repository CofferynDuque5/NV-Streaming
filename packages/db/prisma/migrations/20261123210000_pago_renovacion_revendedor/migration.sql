-- Renovaciones de revendedores pagadas en línea (solo agrega una tabla).
CREATE TABLE "pagos_renovacion_revendedor" (
    "id" UUID NOT NULL,
    "revendedor_id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "renovar_ids" UUID[],
    "total_usd" DECIMAL(14,2) NOT NULL,
    "recarga_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_renovacion_revendedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pagos_renovacion_revendedor_factura_id_key" ON "pagos_renovacion_revendedor"("factura_id");
CREATE UNIQUE INDEX "pagos_renovacion_revendedor_recarga_id_key" ON "pagos_renovacion_revendedor"("recarga_id");
CREATE INDEX "pagos_renovacion_revendedor_revendedor_id_creado_en_idx" ON "pagos_renovacion_revendedor"("revendedor_id", "creado_en" DESC);

ALTER TABLE "pagos_renovacion_revendedor" ADD CONSTRAINT "pagos_renovacion_revendedor_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos_renovacion_revendedor" ADD CONSTRAINT "pagos_renovacion_revendedor_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pagos_renovacion_revendedor" ADD CONSTRAINT "pagos_renovacion_revendedor_recarga_id_fkey" FOREIGN KEY ("recarga_id") REFERENCES "recargas_saldo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
