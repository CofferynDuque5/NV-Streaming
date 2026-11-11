-- CreateTable
CREATE TABLE "combos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200),
    "precio_usd" DECIMAL(14,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "combos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "combos_precio_positivo" CHECK ("precio_usd" > 0)
);

-- CreateTable
CREATE TABLE "combo_planes" (
    "combo_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "combo_planes_pkey" PRIMARY KEY ("combo_id","plan_id")
);

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN "descuento_combo_usd" DECIMAL(14,2);

-- CreateIndex
CREATE UNIQUE INDEX "combos_nombre_key" ON "combos"("nombre");

-- CreateIndex
CREATE INDEX "combos_activo_orden_idx" ON "combos"("activo", "orden");

-- CreateIndex
CREATE INDEX "combo_planes_plan_id_idx" ON "combo_planes"("plan_id");

-- AddForeignKey
ALTER TABLE "combo_planes" ADD CONSTRAINT "combo_planes_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_planes" ADD CONSTRAINT "combo_planes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
