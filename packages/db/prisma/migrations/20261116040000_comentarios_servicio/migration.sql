-- Comentarios de los clientes en la página de cada servicio.
-- CreateTable
CREATE TABLE "comentarios_servicio" (
    "id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "texto" VARCHAR(600) NOT NULL,
    "estrellas" SMALLINT,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "respuesta" VARCHAR(600),
    "respondido_por_id" UUID,
    "respondido_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comentarios_servicio_servicio_id_creado_en_idx" ON "comentarios_servicio"("servicio_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "comentarios_servicio_usuario_id_idx" ON "comentarios_servicio"("usuario_id");

-- AddForeignKey
ALTER TABLE "comentarios_servicio" ADD CONSTRAINT "comentarios_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_servicio" ADD CONSTRAINT "comentarios_servicio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_servicio" ADD CONSTRAINT "comentarios_servicio_respondido_por_id_fkey" FOREIGN KEY ("respondido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

