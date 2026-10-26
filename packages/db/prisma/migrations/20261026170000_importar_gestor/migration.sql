-- CreateTable
CREATE TABLE "lotes_gestor" (
    "id" UUID NOT NULL,
    "plataforma_origen" VARCHAR(120) NOT NULL,
    "plataforma_nombre" VARCHAR(80) NOT NULL,
    "servicio_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cuadre" JSONB NOT NULL,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertido_en" TIMESTAMPTZ(3),
    "revertido_por_id" UUID,

    CONSTRAINT "lotes_gestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_gestor" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "origen_id" VARCHAR(260) NOT NULL,
    "entidad" VARCHAR(30) NOT NULL,
    "entidad_id" UUID NOT NULL,

    CONSTRAINT "registros_gestor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_gestor_creado_en_idx" ON "lotes_gestor"("creado_en" DESC);

-- CreateIndex
CREATE INDEX "registros_gestor_lote_id_idx" ON "registros_gestor"("lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "registros_gestor_tipo_origen_id_entidad_key" ON "registros_gestor"("tipo", "origen_id", "entidad");

-- AddForeignKey
ALTER TABLE "registros_gestor" ADD CONSTRAINT "registros_gestor_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_gestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
