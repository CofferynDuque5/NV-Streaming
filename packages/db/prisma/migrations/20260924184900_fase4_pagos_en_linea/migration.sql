-- CreateEnum
CREATE TYPE "EstadoIntentoPago" AS ENUM ('creado', 'pendiente', 'aprobado', 'rechazado', 'cancelado', 'expirado');

-- CreateEnum
CREATE TYPE "EstadoMetodoAutorizado" AS ENUM ('activo', 'revocado', 'invalido');

-- CreateEnum
CREATE TYPE "EstadoCobroAutomatico" AS ENUM ('programado', 'en_curso', 'exitoso', 'fallido', 'cancelado');

-- CreateEnum
CREATE TYPE "EstadoEventoPasarela" AS ENUM ('recibido', 'procesado', 'ignorado', 'error');

-- CreateEnum
CREATE TYPE "EstadoReembolso" AS ENUM ('solicitado', 'completado', 'fallido');

-- AlterEnum
ALTER TYPE "EstadoPago" ADD VALUE 'reembolsado';

-- AlterTable
ALTER TABLE "metodos_cobro" ADD COLUMN     "pasarela" VARCHAR(30),
ADD COLUMN     "tipo" VARCHAR(20) NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "id_externo" VARCHAR(120),
ADD COLUMN     "monto_reembolsado" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "origen" VARCHAR(20) NOT NULL DEFAULT 'manual',
ADD COLUMN     "pasarela" VARCHAR(30);

-- AlterTable
ALTER TABLE "suscripciones" ADD COLUMN     "metodo_autorizado_id" UUID;

-- CreateTable
CREATE TABLE "intentos_pago" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(20) NOT NULL,
    "factura_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "metodo_cobro_id" UUID NOT NULL,
    "pasarela" VARCHAR(30) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoIntentoPago" NOT NULL DEFAULT 'creado',
    "id_externo" VARCHAR(120),
    "url_pago" VARCHAR(1000),
    "guardar_metodo" BOOLEAN NOT NULL DEFAULT false,
    "pago_id" UUID,
    "error" VARCHAR(500),
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intentos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos_pago_autorizados" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "pasarela" VARCHAR(30) NOT NULL,
    "token_cifrado" VARCHAR(2000) NOT NULL,
    "descripcion" VARCHAR(120) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "estado" "EstadoMetodoAutorizado" NOT NULL DEFAULT 'activo',
    "texto_aceptado" VARCHAR(2000) NOT NULL,
    "version_texto" VARCHAR(20) NOT NULL,
    "autorizado_en" TIMESTAMPTZ(3) NOT NULL,
    "autorizado_ip" VARCHAR(64),
    "autorizado_agente" VARCHAR(300),
    "revocado_en" TIMESTAMPTZ(3),
    "revocado_por_id" UUID,
    "motivo_estado" VARCHAR(500),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "metodos_pago_autorizados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobros_automaticos" (
    "id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "suscripcion_id" UUID NOT NULL,
    "metodo_id" UUID NOT NULL,
    "intento" INTEGER NOT NULL,
    "estado" "EstadoCobroAutomatico" NOT NULL DEFAULT 'programado',
    "programado_para" TIMESTAMPTZ(3) NOT NULL,
    "ejecutado_en" TIMESTAMPTZ(3),
    "clave_idempotencia" VARCHAR(120) NOT NULL,
    "id_externo" VARCHAR(120),
    "pago_id" UUID,
    "error" VARCHAR(500),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobros_automaticos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_pasarela" (
    "id" UUID NOT NULL,
    "pasarela" VARCHAR(30) NOT NULL,
    "id_evento" VARCHAR(160) NOT NULL,
    "tipo" VARCHAR(120) NOT NULL,
    "id_recurso" VARCHAR(160),
    "firma_valida" BOOLEAN NOT NULL,
    "carga" JSONB NOT NULL,
    "estado" "EstadoEventoPasarela" NOT NULL DEFAULT 'recibido',
    "error" VARCHAR(500),
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMPTZ(3),

    CONSTRAINT "eventos_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reembolsos" (
    "id" UUID NOT NULL,
    "pago_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "estado" "EstadoReembolso" NOT NULL DEFAULT 'solicitado',
    "clave_idempotencia" VARCHAR(120) NOT NULL,
    "id_externo" VARCHAR(120),
    "error" VARCHAR(500),
    "solicitado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completado_en" TIMESTAMPTZ(3),

    CONSTRAINT "reembolsos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intentos_pago_referencia_key" ON "intentos_pago"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "intentos_pago_pago_id_key" ON "intentos_pago"("pago_id");

-- CreateIndex
CREATE INDEX "intentos_pago_factura_id_estado_idx" ON "intentos_pago"("factura_id", "estado");

-- CreateIndex
CREATE INDEX "intentos_pago_cliente_id_creado_en_idx" ON "intentos_pago"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "intentos_pago_estado_expira_en_idx" ON "intentos_pago"("estado", "expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "intentos_pago_pasarela_id_externo_key" ON "intentos_pago"("pasarela", "id_externo");

-- CreateIndex
CREATE INDEX "metodos_pago_autorizados_cliente_id_estado_idx" ON "metodos_pago_autorizados"("cliente_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cobros_automaticos_clave_idempotencia_key" ON "cobros_automaticos"("clave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "cobros_automaticos_pago_id_key" ON "cobros_automaticos"("pago_id");

-- CreateIndex
CREATE INDEX "cobros_automaticos_estado_programado_para_idx" ON "cobros_automaticos"("estado", "programado_para");

-- CreateIndex
CREATE UNIQUE INDEX "cobros_automaticos_factura_id_intento_key" ON "cobros_automaticos"("factura_id", "intento");

-- CreateIndex
CREATE INDEX "eventos_pasarela_estado_recibido_en_idx" ON "eventos_pasarela"("estado", "recibido_en");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_pasarela_pasarela_id_evento_key" ON "eventos_pasarela"("pasarela", "id_evento");

-- CreateIndex
CREATE UNIQUE INDEX "reembolsos_clave_idempotencia_key" ON "reembolsos"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "reembolsos_pago_id_idx" ON "reembolsos"("pago_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_pasarela_id_externo_key" ON "pagos"("pasarela", "id_externo");

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_metodo_autorizado_id_fkey" FOREIGN KEY ("metodo_autorizado_id") REFERENCES "metodos_pago_autorizados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_metodo_cobro_id_fkey" FOREIGN KEY ("metodo_cobro_id") REFERENCES "metodos_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_pago_autorizados" ADD CONSTRAINT "metodos_pago_autorizados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodos_pago_autorizados" ADD CONSTRAINT "metodos_pago_autorizados_revocado_por_id_fkey" FOREIGN KEY ("revocado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_automaticos_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_automaticos_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_automaticos_metodo_id_fkey" FOREIGN KEY ("metodo_id") REFERENCES "metodos_pago_autorizados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_automaticos_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de negocio que la base garantiza.
ALTER TABLE "metodos_cobro" ADD CONSTRAINT "metodos_cobro_tipo_valido"
  CHECK ("tipo" IN ('manual', 'pasarela'));
ALTER TABLE "metodos_cobro" ADD CONSTRAINT "metodos_cobro_pasarela_segun_tipo"
  CHECK (("tipo" = 'pasarela') = ("pasarela" IS NOT NULL));

ALTER TABLE "pagos" ADD CONSTRAINT "pagos_origen_valido"
  CHECK ("origen" IN ('manual', 'pasarela'));
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_pasarela_segun_origen"
  CHECK (("origen" = 'pasarela') = ("pasarela" IS NOT NULL AND "id_externo" IS NOT NULL));
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reembolso_valido"
  CHECK ("monto_reembolsado" >= 0 AND "monto_reembolsado" <= COALESCE("monto_recibido", 0));

ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_aprobado_con_pago"
  CHECK (("estado" = 'aprobado') = ("pago_id" IS NOT NULL));

ALTER TABLE "metodos_pago_autorizados" ADD CONSTRAINT "metodos_autorizados_revocacion"
  CHECK (("estado" = 'revocado') = ("revocado_en" IS NOT NULL));

ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_intento_valido" CHECK ("intento" >= 1);
ALTER TABLE "cobros_automaticos" ADD CONSTRAINT "cobros_exitoso_con_pago"
  CHECK (("estado" = 'exitoso') = ("pago_id" IS NOT NULL));

ALTER TABLE "reembolsos" ADD CONSTRAINT "reembolsos_monto_positivo" CHECK ("monto" > 0);

-- Un intento abierto por factura a la vez (creado o pendiente).
CREATE UNIQUE INDEX "intentos_pago_uno_abierto_por_factura"
  ON "intentos_pago" ("factura_id") WHERE "estado" IN ('creado', 'pendiente');

-- Un cobro automático en curso o programado por factura.
CREATE UNIQUE INDEX "cobros_uno_activo_por_factura"
  ON "cobros_automaticos" ("factura_id") WHERE "estado" IN ('programado', 'en_curso');
