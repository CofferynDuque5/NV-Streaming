-- Métodos de cobro: imagen QR opcional y opción de pedir solo los 4 últimos dígitos de la referencia.
-- Solo agrega columnas: no cambia ni borra datos.
ALTER TABLE "metodos_cobro" ADD COLUMN "referencia_ultimos_4" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "qr_id" UUID;

ALTER TABLE "metodos_cobro" ADD CONSTRAINT "metodos_cobro_qr_id_fkey" FOREIGN KEY ("qr_id") REFERENCES "medios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
