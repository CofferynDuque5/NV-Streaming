-- Fecha de la caída de una cuenta, para la cola de reposición y los días perdidos.
ALTER TABLE "cuentas_servicio" ADD COLUMN "caida_en" TIMESTAMPTZ(3);
UPDATE "cuentas_servicio" SET "caida_en" = "actualizado_en" WHERE "estado" = 'caida';
