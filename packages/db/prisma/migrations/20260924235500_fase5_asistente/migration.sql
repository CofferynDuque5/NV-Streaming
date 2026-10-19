-- CreateEnum
CREATE TYPE "RolMensajeAsistente" AS ENUM ('usuario', 'asistente');

-- CreateEnum
CREATE TYPE "EstadoAccionPropuesta" AS ENUM ('propuesta', 'ejecutada', 'rechazada', 'fallida', 'expirada');

-- CreateTable
CREATE TABLE "conversaciones_asistente" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversaciones_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_asistente" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "rol" "RolMensajeAsistente" NOT NULL,
    "texto" TEXT NOT NULL,
    "herramientas" JSONB NOT NULL DEFAULT '[]',
    "proveedor" VARCHAR(20),
    "modelo" VARCHAR(80),
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_salida" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acciones_propuestas" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "mensaje_id" UUID,
    "solicitada_por_id" UUID NOT NULL,
    "herramienta" VARCHAR(60) NOT NULL,
    "permiso" VARCHAR(60) NOT NULL,
    "parametros" JSONB NOT NULL,
    "resumen" VARCHAR(500) NOT NULL,
    "estado" "EstadoAccionPropuesta" NOT NULL DEFAULT 'propuesta',
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "decidida_por_id" UUID,
    "decidida_en" TIMESTAMPTZ(3),
    "motivo_rechazo" VARCHAR(500),
    "resultado" VARCHAR(500),
    "error" VARCHAR(500),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acciones_propuestas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_asistente" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "proveedor" VARCHAR(20) NOT NULL DEFAULT 'local',
    "modelo" VARCHAR(80),
    "tope_mensual_usd" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "mensajes_diarios_por_usuario" INTEGER NOT NULL DEFAULT 100,
    "actualizado_por_id" UUID,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracion_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_asistente" (
    "mes" VARCHAR(7) NOT NULL,
    "proveedor" VARCHAR(20) NOT NULL,
    "peticiones" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" BIGINT NOT NULL DEFAULT 0,
    "tokens_salida" BIGINT NOT NULL DEFAULT 0,
    "costo_usd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "uso_asistente_pkey" PRIMARY KEY ("mes","proveedor")
);

-- CreateIndex
CREATE INDEX "conversaciones_asistente_usuario_id_actualizada_en_idx" ON "conversaciones_asistente"("usuario_id", "actualizada_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_asistente_conversacion_id_orden_key" ON "mensajes_asistente"("conversacion_id", "orden");

-- CreateIndex
CREATE INDEX "acciones_propuestas_estado_expira_en_idx" ON "acciones_propuestas"("estado", "expira_en");

-- CreateIndex
CREATE INDEX "acciones_propuestas_conversacion_id_idx" ON "acciones_propuestas"("conversacion_id");

-- CreateIndex
CREATE INDEX "acciones_propuestas_solicitada_por_id_creada_en_idx" ON "acciones_propuestas"("solicitada_por_id", "creada_en" DESC);

-- AddForeignKey
ALTER TABLE "conversaciones_asistente" ADD CONSTRAINT "conversaciones_asistente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_asistente" ADD CONSTRAINT "mensajes_asistente_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_asistente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acciones_propuestas" ADD CONSTRAINT "acciones_propuestas_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_asistente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acciones_propuestas" ADD CONSTRAINT "acciones_propuestas_mensaje_id_fkey" FOREIGN KEY ("mensaje_id") REFERENCES "mensajes_asistente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acciones_propuestas" ADD CONSTRAINT "acciones_propuestas_solicitada_por_id_fkey" FOREIGN KEY ("solicitada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acciones_propuestas" ADD CONSTRAINT "acciones_propuestas_decidida_por_id_fkey" FOREIGN KEY ("decidida_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_asistente" ADD CONSTRAINT "configuracion_asistente_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola fila de configuración, inactiva hasta que administración la active.
ALTER TABLE "configuracion_asistente" ADD CONSTRAINT "configuracion_asistente_una_fila" CHECK ("id" = 1);
ALTER TABLE "configuracion_asistente" ADD CONSTRAINT "configuracion_asistente_proveedor" CHECK ("proveedor" IN ('local', 'claude', 'sandbox'));
ALTER TABLE "configuracion_asistente" ADD CONSTRAINT "configuracion_asistente_limites" CHECK ("tope_mensual_usd" >= 0 AND "mensajes_diarios_por_usuario" BETWEEN 1 AND 1000);
INSERT INTO "configuracion_asistente" ("id", "actualizado_en") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
