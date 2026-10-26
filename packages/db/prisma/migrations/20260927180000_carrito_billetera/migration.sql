-- CreateEnum
CREATE TYPE "TipoMovimientoBilletera" AS ENUM ('recarga', 'pago', 'ajuste');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "saldo_usd" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "pedido_id" UUID;

-- AlterTable
ALTER TABLE "pagos" ALTER COLUMN "metodo_cobro_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "pagar_al_recargar" BOOLEAN NOT NULL DEFAULT false,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recargas_billetera" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(20) NOT NULL,
    "cliente_id" UUID NOT NULL,
    "pedido_id" UUID,
    "metodo_cobro_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "monto_declarado" DECIMAL(14,2) NOT NULL,
    "monto_recibido" DECIMAL(14,2),
    "tasa" DECIMAL(18,6) NOT NULL,
    "monto_usd" DECIMAL(14,2),
    "referencia_externa" VARCHAR(80),
    "fecha_pago" TIMESTAMPTZ(3) NOT NULL,
    "comprobante_id" UUID,
    "estado" "EstadoRecarga" NOT NULL DEFAULT 'en_revision',
    "motivo_rechazo" VARCHAR(500),
    "notas" VARCHAR(500),
    "revisado_por_id" UUID,
    "revisado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recargas_billetera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_billetera" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo" "TipoMovimientoBilletera" NOT NULL,
    "monto_usd" DECIMAL(14,2) NOT NULL,
    "saldo_resultante_usd" DECIMAL(14,2) NOT NULL,
    "recarga_id" UUID,
    "factura_id" UUID,
    "motivo" VARCHAR(500),
    "autor_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_billetera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_creado_en_idx" ON "pedidos"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recargas_billetera_referencia_key" ON "recargas_billetera"("referencia");

-- CreateIndex
CREATE INDEX "recargas_billetera_estado_creado_en_idx" ON "recargas_billetera"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "recargas_billetera_cliente_id_creado_en_idx" ON "recargas_billetera"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_billetera_recarga_id_key" ON "movimientos_billetera"("recarga_id");

-- CreateIndex
CREATE INDEX "movimientos_billetera_cliente_id_creado_en_idx" ON "movimientos_billetera"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "movimientos_billetera_factura_id_idx" ON "movimientos_billetera"("factura_id");

-- CreateIndex
CREATE INDEX "facturas_pedido_id_idx" ON "facturas"("pedido_id");

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_metodo_cobro_id_fkey" FOREIGN KEY ("metodo_cobro_id") REFERENCES "metodos_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_recarga_id_fkey" FOREIGN KEY ("recarga_id") REFERENCES "recargas_billetera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Reglas que la base de datos garantiza por sí misma ──────────────────────

-- Pagos con saldo de la billetera: sin método de cobro, y solo ellos.
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_origen_valido";
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_origen_valido"
  CHECK ("origen" IN ('manual', 'pasarela', 'billetera'));
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_metodo_segun_origen"
  CHECK (("origen" = 'billetera') = ("metodo_cobro_id" IS NULL));

-- El saldo nunca puede quedar negativo.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_saldo_no_negativo" CHECK ("saldo_usd" >= 0);
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_montos_positivos" CHECK ("monto_declarado" > 0 AND ("monto_recibido" IS NULL OR "monto_recibido" > 0) AND ("monto_usd" IS NULL OR "monto_usd" > 0) AND "tasa" > 0);
ALTER TABLE "recargas_billetera" ADD CONSTRAINT "recargas_billetera_confirmada_con_monto" CHECK ("estado" <> 'confirmada' OR ("monto_usd" IS NOT NULL AND "monto_recibido" IS NOT NULL));

-- Cada tipo de movimiento con su signo y su referencia, y el saldo resultante nunca negativo.
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_signo" CHECK (
  ("tipo" = 'recarga' AND "monto_usd" > 0 AND "recarga_id" IS NOT NULL)
  OR ("tipo" = 'pago' AND "monto_usd" < 0 AND "factura_id" IS NOT NULL)
  OR ("tipo" = 'ajuste' AND "monto_usd" <> 0 AND "motivo" IS NOT NULL)
);
ALTER TABLE "movimientos_billetera" ADD CONSTRAINT "movimientos_billetera_resultante" CHECK ("saldo_resultante_usd" >= 0);
-- Una factura se paga con saldo una sola vez.
CREATE UNIQUE INDEX "movimientos_billetera_un_pago" ON "movimientos_billetera" ("factura_id") WHERE "tipo" = 'pago';

-- El libro mayor de la billetera es de solo inserción.
CREATE FUNCTION "movimientos_billetera_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de la billetera no se pueden modificar ni borrar; registra un ajuste.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "movimientos_billetera_sin_cambios" BEFORE UPDATE OR DELETE ON "movimientos_billetera"
  FOR EACH ROW EXECUTE FUNCTION "movimientos_billetera_inmutable"();
