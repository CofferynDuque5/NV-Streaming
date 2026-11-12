-- CreateEnum
CREATE TYPE "TipoPlan" AS ENUM ('suscripcion', 'recarga', 'paquete', 'pase', 'tarjeta');

-- AlterTable
ALTER TABLE "planes" ADD COLUMN "tipo" "TipoPlan" NOT NULL DEFAULT 'suscripcion';

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN "imagen_id" UUID,
ADD COLUMN "datos_requeridos" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "suscripciones" ADD COLUMN "datos_cliente" JSONB;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_imagen_id_fkey" FOREIGN KEY ("imagen_id") REFERENCES "medios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
