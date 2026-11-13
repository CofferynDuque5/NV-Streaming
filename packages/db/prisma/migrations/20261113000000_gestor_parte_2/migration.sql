-- Cuentas sin anotar: compradas pero en espera (geobloqueo, liberación). No se asignan.
ALTER TYPE "EstadoCuentaServicio" ADD VALUE IF NOT EXISTS 'en_espera';
ALTER TABLE "cuentas_servicio" ADD COLUMN "liberacion_en" DATE;

-- Notas con tipo, aviso y hecha; pueden no tener cliente (pendientes generales).
CREATE TYPE "TipoNota" AS ENUM ('entregar', 'renovar', 'pendiente', 'fiado', 'paga_dia', 'no_cortar', 'otro');
ALTER TABLE "notas_internas"
  ALTER COLUMN "cliente_id" DROP NOT NULL,
  ADD COLUMN "tipo" "TipoNota" NOT NULL DEFAULT 'otro',
  ADD COLUMN "avisar_en" TIMESTAMPTZ(3),
  ADD COLUMN "dia_pago" INTEGER,
  ADD COLUMN "hecha_en" TIMESTAMPTZ(3),
  ADD COLUMN "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "notas_internas_dia_pago_check" CHECK ("dia_pago" IS NULL OR "dia_pago" BETWEEN 1 AND 31);
CREATE INDEX "notas_internas_hecha_en_avisar_en_idx" ON "notas_internas"("hecha_en", "avisar_en");

-- Meta de ingresos del mes.
CREATE TABLE "metas_mes" (
    "mes" DATE NOT NULL,
    "monto_usd" DECIMAL(14,2) NOT NULL,
    "definida_por_id" UUID NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "metas_mes_pkey" PRIMARY KEY ("mes"),
    CONSTRAINT "metas_mes_monto_usd_check" CHECK ("monto_usd" > 0)
);
ALTER TABLE "metas_mes" ADD CONSTRAINT "metas_mes_definida_por_id_fkey" FOREIGN KEY ("definida_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
