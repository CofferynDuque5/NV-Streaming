-- Renovar varios periodos de una vez y elegir si cuentan desde el vencimiento o desde hoy.
ALTER TABLE "facturas" ADD COLUMN "periodos" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "facturas" ADD COLUMN "desde_hoy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_periodos_check" CHECK ("periodos" BETWEEN 1 AND 12);
