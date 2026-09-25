-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('pendiente', 'en_curso', 'entregada', 'fallida', 'revocada', 'anulada');

-- CreateEnum
CREATE TYPE "MotivoEntrega" AS ENUM ('alta', 'renovacion', 'compra');

-- CreateEnum
CREATE TYPE "EstadoCodigo" AS ENUM ('disponible', 'reservado', 'entregado', 'anulado');

-- AlterTable
ALTER TABLE "planes" ADD COLUMN     "sku_proveedor" VARCHAR(80);

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "configuracion" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "secreto_webhook_cifrado" VARCHAR(500),
ADD COLUMN     "secreto_webhook_rotado_en" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "entregas" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "revendedor_id" UUID,
    "suscripcion_id" UUID,
    "compra_revendedor_id" UUID,
    "factura_id" UUID,
    "adaptador" VARCHAR(40) NOT NULL,
    "motivo" "MotivoEntrega" NOT NULL,
    "clave_idempotencia" VARCHAR(120) NOT NULL,
    "estado" "EstadoEntrega" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento_en" TIMESTAMPTZ(3),
    "referencia_externa" VARCHAR(200),
    "datos_cifrados" VARCHAR(4000),
    "instrucciones" VARCHAR(2000),
    "error" VARCHAR(500),
    "periodo_inicio" TIMESTAMPTZ(3),
    "periodo_fin" TIMESTAMPTZ(3),
    "completada_por_id" UUID,
    "entregada_en" TIMESTAMPTZ(3),
    "vista_en" TIMESTAMPTZ(3),
    "revocada_en" TIMESTAMPTZ(3),
    "anulada_en" TIMESTAMPTZ(3),
    "motivo_anulacion" VARCHAR(500),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entregas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_codigos" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "subido_por_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "repetidos" INTEGER NOT NULL DEFAULT 0,
    "vence_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_codigos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_inventario" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "codigo_cifrado" VARCHAR(1000) NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "estado" "EstadoCodigo" NOT NULL DEFAULT 'disponible',
    "entrega_id" UUID,
    "vence_en" TIMESTAMPTZ(3),
    "entregado_en" TIMESTAMPTZ(3),
    "anulado_en" TIMESTAMPTZ(3),
    "anulado_por_id" UUID,
    "motivo_anulacion" VARCHAR(300),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "codigos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entregas_clave_idempotencia_key" ON "entregas"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "entregas_estado_creado_en_idx" ON "entregas"("estado", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "entregas_cliente_id_creado_en_idx" ON "entregas"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "entregas_revendedor_id_creado_en_idx" ON "entregas"("revendedor_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "entregas_suscripcion_id_idx" ON "entregas"("suscripcion_id");

-- CreateIndex
CREATE INDEX "entregas_compra_revendedor_id_idx" ON "entregas"("compra_revendedor_id");

-- CreateIndex
CREATE INDEX "entregas_plan_id_estado_idx" ON "entregas"("plan_id", "estado");

-- CreateIndex
CREATE INDEX "lotes_codigos_plan_id_creado_en_idx" ON "lotes_codigos"("plan_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "codigos_inventario_huella_key" ON "codigos_inventario"("huella");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_inventario_entrega_id_key" ON "codigos_inventario"("entrega_id");

-- CreateIndex
CREATE INDEX "codigos_inventario_plan_id_estado_creado_en_idx" ON "codigos_inventario"("plan_id", "estado", "creado_en");

-- CreateIndex
CREATE INDEX "codigos_inventario_lote_id_idx" ON "codigos_inventario"("lote_id");

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_compra_revendedor_id_fkey" FOREIGN KEY ("compra_revendedor_id") REFERENCES "compras_revendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_completada_por_id_fkey" FOREIGN KEY ("completada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_codigos" ADD CONSTRAINT "lotes_codigos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_codigos" ADD CONSTRAINT "lotes_codigos_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_codigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_entrega_id_fkey" FOREIGN KEY ("entrega_id") REFERENCES "entregas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ── Reglas de integridad de las entregas (fase 6) ──────────────────────────────

ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_adaptador_valido"
  CHECK ("adaptador" IN ('manual', 'codigos', 'webhook'));
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_configuracion_objeto"
  CHECK (jsonb_typeof("configuracion") = 'object');

-- Una entrega nace de una factura pagada (suscripción) o de una compra de revendedor, nunca de ambas.
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_un_origen"
  CHECK (("suscripcion_id" IS NULL) <> ("compra_revendedor_id" IS NULL));
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_motivo_origen"
  CHECK (("motivo" = 'compra') = ("compra_revendedor_id" IS NOT NULL));
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_compra_de_revendedor"
  CHECK ("compra_revendedor_id" IS NULL OR "revendedor_id" IS NOT NULL);
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_adaptador_valido"
  CHECK ("adaptador" IN ('manual', 'codigos', 'webhook'));
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_intentos_no_negativos" CHECK ("intentos" >= 0);
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_entregada_con_fecha"
  CHECK ("estado" NOT IN ('entregada', 'revocada') OR "entregada_en" IS NOT NULL);
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_revocada_con_fecha"
  CHECK (("estado" = 'revocada') = ("revocada_en" IS NOT NULL));
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_anulada_con_fecha"
  CHECK (("estado" = 'anulada') = ("anulada_en" IS NOT NULL));
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_vista_tras_entrega"
  CHECK ("vista_en" IS NULL OR "entregada_en" IS NOT NULL);
-- La factura pagada solo puede originar una entrega (además de la clave de idempotencia).
CREATE UNIQUE INDEX "entregas_una_por_factura" ON "entregas" ("factura_id") WHERE "factura_id" IS NOT NULL;
CREATE UNIQUE INDEX "entregas_una_por_compra" ON "entregas" ("compra_revendedor_id") WHERE "compra_revendedor_id" IS NOT NULL;
-- Cola de reintentos: entregas pendientes por fecha del próximo intento.
CREATE INDEX "entregas_pendientes_proximo_intento" ON "entregas" ("proximo_intento_en") WHERE "estado" = 'pendiente';

ALTER TABLE "lotes_codigos" ADD CONSTRAINT "lotes_codigos_cantidades"
  CHECK ("cantidad" >= 0 AND "repetidos" >= 0 AND "cantidad" <= 5000);

ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_huella_hex"
  CHECK ("huella" ~ '^[0-9a-f]{64}$');
-- Un código reservado o entregado siempre apunta a su entrega; uno disponible o anulado, nunca.
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_entrega_segun_estado"
  CHECK (("estado" IN ('reservado', 'entregado')) = ("entrega_id" IS NOT NULL));
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_entregado_con_fecha"
  CHECK (("estado" = 'entregado') = ("entregado_en" IS NOT NULL));
ALTER TABLE "codigos_inventario" ADD CONSTRAINT "codigos_inventario_anulado_con_fecha"
  CHECK (("estado" = 'anulado') = ("anulado_en" IS NOT NULL));
-- Existencias: el adaptador toma el disponible más antiguo de cada plan.
CREATE INDEX "codigos_inventario_disponibles" ON "codigos_inventario" ("plan_id", "creado_en", "id") WHERE "estado" = 'disponible';
