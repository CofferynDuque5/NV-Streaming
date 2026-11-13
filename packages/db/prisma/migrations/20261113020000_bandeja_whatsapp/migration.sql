-- Bandeja de WhatsApp en Soporte: solo agrega tablas nuevas.
-- CreateEnum
CREATE TYPE "DireccionWhatsApp" AS ENUM ('entrante', 'saliente');

-- CreateTable
CREATE TABLE "conversaciones_whatsapp" (
    "id" UUID NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120),
    "cliente_id" UUID,
    "ultimo_entrante_en" TIMESTAMPTZ(3),
    "ultimo_mensaje_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "no_leidos" INTEGER NOT NULL DEFAULT 0,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversaciones_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_whatsapp" (
    "id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "direccion" "DireccionWhatsApp" NOT NULL,
    "texto" VARCHAR(4096) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL DEFAULT 'text',
    "wa_id" VARCHAR(160),
    "estado" VARCHAR(20),
    "autor_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_whatsapp_telefono_key" ON "conversaciones_whatsapp"("telefono");

-- CreateIndex
CREATE INDEX "conversaciones_whatsapp_cerrada_ultimo_mensaje_en_idx" ON "conversaciones_whatsapp"("cerrada", "ultimo_mensaje_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_whatsapp_wa_id_key" ON "mensajes_whatsapp"("wa_id");

-- CreateIndex
CREATE INDEX "mensajes_whatsapp_conversacion_id_creado_en_idx" ON "mensajes_whatsapp"("conversacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "conversaciones_whatsapp" ADD CONSTRAINT "conversaciones_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_whatsapp" ADD CONSTRAINT "mensajes_whatsapp_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

