-- Motivo de un corte anticipado: lo ve el cliente mientras siga suspendida. Solo agrega.
ALTER TABLE "suscripciones" ADD COLUMN "motivo_suspension" VARCHAR(300);
