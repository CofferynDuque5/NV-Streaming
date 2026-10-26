-- AlterTable
ALTER TABLE "cuentas_servicio" ADD COLUMN     "ciclo_meses" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "pagos_cuenta_servicio" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "monto_usd" DECIMAL(14,2) NOT NULL,
    "pagado_el" DATE NOT NULL,
    "factura_cubierta" DATE,
    "siguiente_cobro" DATE NOT NULL,
    "metodo_pago" VARCHAR(60),
    "nota" VARCHAR(500),
    "registrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(3),
    "anulado_por_id" UUID,
    "motivo_anulacion" VARCHAR(500),

    CONSTRAINT "pagos_cuenta_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_cuenta_servicio_cuenta_id_creado_en_idx" ON "pagos_cuenta_servicio"("cuenta_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "pagos_cuenta_servicio_pagado_el_idx" ON "pagos_cuenta_servicio"("pagado_el");

-- AddForeignKey
ALTER TABLE "pagos_cuenta_servicio" ADD CONSTRAINT "pagos_cuenta_servicio_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuenta_servicio" ADD CONSTRAINT "pagos_cuenta_servicio_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cuenta_servicio" ADD CONSTRAINT "pagos_cuenta_servicio_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que la base hace cumplir aunque falle la aplicación.
ALTER TABLE "cuentas_servicio"
  ADD CONSTRAINT "cuentas_servicio_ciclo_valido" CHECK ("ciclo_meses" BETWEEN 1 AND 12);

ALTER TABLE "pagos_cuenta_servicio"
  ADD CONSTRAINT "pagos_cuenta_servicio_monto_no_negativo" CHECK ("monto_usd" >= 0),
  -- Anulado del todo o nada: fecha, autor y motivo juntos.
  ADD CONSTRAINT "pagos_cuenta_servicio_anulacion_completa"
    CHECK (("anulado_en" IS NULL) = ("anulado_por_id" IS NULL)
       AND ("anulado_en" IS NULL) = ("motivo_anulacion" IS NULL));
