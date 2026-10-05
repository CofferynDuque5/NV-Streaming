-- CreateEnum
CREATE TYPE "EstadoTrabajo" AS ENUM ('pendiente', 'en_curso', 'completado', 'fallido', 'cancelado');

-- CreateEnum
CREATE TYPE "CanalAviso" AS ENUM ('correo', 'whatsapp');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('en_curso', 'completada', 'con_errores', 'fallida');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('pendiente', 'enviada', 'fallida', 'omitida');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "recibir_recordatorios" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tasas_cambio" ADD COLUMN     "fuente" VARCHAR(60),
ADD COLUMN     "origen" VARCHAR(20) NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "origen" VARCHAR(20) NOT NULL DEFAULT 'cliente',
ALTER COLUMN "creado_por_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "trabajos" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "carga" JSONB NOT NULL DEFAULT '{}',
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'pendiente',
    "ejecutar_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "max_intentos" INTEGER NOT NULL DEFAULT 5,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "ultimo_error" VARCHAR(1000),
    "clave_unica" VARCHAR(200),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completado_en" TIMESTAMPTZ(3),

    CONSTRAINT "trabajos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automatizaciones" (
    "tipo" VARCHAR(60) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "canales" "CanalAviso"[] DEFAULT ARRAY['correo']::"CanalAviso"[],
    "ultima_ejecucion_en" TIMESTAMPTZ(3),
    "actualizado_por_id" UUID,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "automatizaciones_pkey" PRIMARY KEY ("tipo")
);

-- CreateTable
CREATE TABLE "ejecuciones_automatizacion" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "estado" "EstadoEjecucion" NOT NULL DEFAULT 'en_curso',
    "disparo" VARCHAR(20) NOT NULL DEFAULT 'programada',
    "procesados" INTEGER NOT NULL DEFAULT 0,
    "omitidos" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "resumen" VARCHAR(1000),
    "detalle" JSONB,
    "iniciada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminada_en" TIMESTAMPTZ(3),

    CONSTRAINT "ejecuciones_automatizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "canal" "CanalAviso" NOT NULL,
    "plantilla" VARCHAR(60) NOT NULL,
    "destino" VARCHAR(254) NOT NULL,
    "cliente_id" UUID,
    "usuario_id" UUID,
    "automatizacion" VARCHAR(60),
    "entidad" VARCHAR(40),
    "entidad_id" UUID,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'pendiente',
    "motivo" VARCHAR(300),
    "error" VARCHAR(500),
    "proveedor" VARCHAR(30),
    "referencia_externa" VARCHAR(120),
    "clave_unica" VARCHAR(200) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMPTZ(3),

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trabajos_clave_unica_key" ON "trabajos"("clave_unica");

-- CreateIndex
CREATE INDEX "trabajos_estado_ejecutar_en_idx" ON "trabajos"("estado", "ejecutar_en");

-- CreateIndex
CREATE INDEX "trabajos_tipo_creado_en_idx" ON "trabajos"("tipo", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "ejecuciones_automatizacion_tipo_iniciada_en_idx" ON "ejecuciones_automatizacion"("tipo", "iniciada_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_clave_unica_key" ON "notificaciones"("clave_unica");

-- CreateIndex
CREATE INDEX "notificaciones_creado_en_idx" ON "notificaciones"("creado_en" DESC);

-- CreateIndex
CREATE INDEX "notificaciones_cliente_id_creado_en_idx" ON "notificaciones"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "notificaciones_automatizacion_creado_en_idx" ON "notificaciones"("automatizacion", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "notificaciones_estado_creado_en_idx" ON "notificaciones"("estado", "creado_en");

-- AddForeignKey
ALTER TABLE "automatizaciones" ADD CONSTRAINT "automatizaciones_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecuciones_automatizacion" ADD CONSTRAINT "ejecuciones_automatizacion_tipo_fkey" FOREIGN KEY ("tipo") REFERENCES "automatizaciones"("tipo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tickets existentes: los abrió el equipo si el creador no es el usuario del cliente.
UPDATE "tickets" t SET "origen" = 'equipo'
FROM "clientes" c
WHERE c."id" = t."cliente_id" AND (c."usuario_id" IS NULL OR c."usuario_id" <> t."creado_por_id");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_origen_valido"
  CHECK ("origen" IN ('cliente', 'equipo', 'sistema'));
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_creador_segun_origen"
  CHECK (("origen" = 'sistema') = ("creado_por_id" IS NULL));

ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_origen_valido"
  CHECK ("origen" IN ('manual', 'automatica'));
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_fuente_si_automatica"
  CHECK (("origen" = 'automatica') = ("fuente" IS NOT NULL));

ALTER TABLE "trabajos" ADD CONSTRAINT "trabajos_intentos_validos"
  CHECK ("intentos" >= 0 AND "max_intentos" > 0);

ALTER TABLE "ejecuciones_automatizacion" ADD CONSTRAINT "ejecuciones_contadores_validos"
  CHECK ("procesados" >= 0 AND "omitidos" >= 0 AND "errores" >= 0);
ALTER TABLE "ejecuciones_automatizacion" ADD CONSTRAINT "ejecuciones_disparo_valido"
  CHECK ("disparo" IN ('programada', 'manual'));

ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_con_destinatario"
  CHECK ("cliente_id" IS NOT NULL OR "usuario_id" IS NOT NULL);
