-- Recarga de un revendedor que, al confirmarse, renueva servicios de su cartera (solo agrega columnas).
ALTER TABLE "recargas_saldo" ADD COLUMN "renovar_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "recargas_saldo" ADD COLUMN "renovacion_resultado" VARCHAR(500);
