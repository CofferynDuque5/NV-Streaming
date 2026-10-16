-- Fase 4: evidencia de la autorización en el intento, método de cobro del método autorizado
-- y estado de la pasarela de pruebas.

-- AlterTable
ALTER TABLE "intentos_pago" ADD COLUMN     "autorizado_agente" VARCHAR(300),
ADD COLUMN     "autorizado_en" TIMESTAMPTZ(3),
ADD COLUMN     "autorizado_ip" VARCHAR(64),
ADD COLUMN     "texto_autorizacion" VARCHAR(2000),
ADD COLUMN     "version_texto" VARCHAR(20);

-- AlterTable
ALTER TABLE "metodos_pago_autorizados" ADD COLUMN     "metodo_cobro_id" UUID;

-- CreateTable
CREATE TABLE "operaciones_sandbox" (
    "id" VARCHAR(60) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "referencia" VARCHAR(60),
    "id_interno" VARCHAR(64),
    "monto" DECIMAL(14,2),
    "moneda" "Moneda",
    "descripcion" VARCHAR(200),
    "guardar_metodo" BOOLEAN NOT NULL DEFAULT false,
    "relacionado_id" VARCHAR(60),
    "clave_idempotencia" VARCHAR(160),
    "datos" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operaciones_sandbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_sandbox_clave_idempotencia_key" ON "operaciones_sandbox"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "operaciones_sandbox_id_interno_idx" ON "operaciones_sandbox"("id_interno");

-- CreateIndex
CREATE INDEX "operaciones_sandbox_relacionado_id_idx" ON "operaciones_sandbox"("relacionado_id");

-- AddForeignKey
ALTER TABLE "metodos_pago_autorizados" ADD CONSTRAINT "metodos_pago_autorizados_metodo_cobro_id_fkey" FOREIGN KEY ("metodo_cobro_id") REFERENCES "metodos_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guardar el método exige la evidencia de la autorización.
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_autorizacion_si_guarda"
  CHECK (NOT "guardar_metodo" OR ("texto_autorizacion" IS NOT NULL AND "version_texto" IS NOT NULL AND "autorizado_en" IS NOT NULL));

-- Venezuela (VES) sigue con pago manual: ninguna pasarela cobra en bolívares.
ALTER TABLE "metodos_cobro" ADD CONSTRAINT "metodos_cobro_pasarela_sin_ves"
  CHECK ("tipo" <> 'pasarela' OR "moneda" <> 'VES');
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_sin_ves" CHECK ("moneda" <> 'VES');
ALTER TABLE "metodos_pago_autorizados" ADD CONSTRAINT "metodos_autorizados_sin_ves" CHECK ("moneda" <> 'VES');
