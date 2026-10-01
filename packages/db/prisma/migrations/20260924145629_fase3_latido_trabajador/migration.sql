-- CreateTable
CREATE TABLE "latidos_trabajador" (
    "id" VARCHAR(120) NOT NULL,
    "host" VARCHAR(120) NOT NULL,
    "pid" INTEGER NOT NULL,
    "iniciado_en" TIMESTAMPTZ(3) NOT NULL,
    "ultimo_latido_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "latidos_trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "latidos_trabajador_ultimo_latido_en_idx" ON "latidos_trabajador"("ultimo_latido_en" DESC);
