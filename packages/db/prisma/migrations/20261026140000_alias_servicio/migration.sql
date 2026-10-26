-- CreateTable
CREATE TABLE "alias_servicio" (
    "id" UUID NOT NULL,
    "palabra" VARCHAR(40) NOT NULL,
    "servicio_id" UUID NOT NULL,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alias_servicio_palabra_key" ON "alias_servicio"("palabra");

-- CreateIndex
CREATE INDEX "alias_servicio_servicio_id_idx" ON "alias_servicio"("servicio_id");

-- AddForeignKey
ALTER TABLE "alias_servicio" ADD CONSTRAINT "alias_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
