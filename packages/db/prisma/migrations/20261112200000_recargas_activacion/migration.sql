-- Suministros de juegos y modo de entrega de las suscripciones.
ALTER TYPE "TipoPlan" ADD VALUE IF NOT EXISTS 'suministro' AFTER 'recarga';

CREATE TYPE "EntregaPlan" AS ENUM ('alquiler', 'activacion');

ALTER TABLE "planes" ADD COLUMN "entrega" "EntregaPlan" NOT NULL DEFAULT 'alquiler';
