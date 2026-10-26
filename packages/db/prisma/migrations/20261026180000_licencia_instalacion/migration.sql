-- CreateTable
CREATE TABLE "licencia_instalacion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "licencia" VARCHAR(2000) NOT NULL,
    "cargada_por_id" UUID,
    "cargada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licencia_instalacion_pkey" PRIMARY KEY ("id")
);
