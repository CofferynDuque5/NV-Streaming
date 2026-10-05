-- CreateEnum
CREATE TYPE "EstadoRevendedor" AS ENUM ('solicitud', 'aprobado', 'rechazado', 'suspendido');

-- CreateEnum
CREATE TYPE "EstadoRecarga" AS ENUM ('en_revision', 'confirmada', 'rechazada');

-- CreateEnum
CREATE TYPE "TipoMovimientoSaldo" AS ENUM ('recarga', 'compra', 'reembolso', 'ajuste');

-- CreateEnum
CREATE TYPE "TipoCompra" AS ENUM ('alta', 'renovacion');

-- CreateEnum
CREATE TYPE "EstadoCompra" AS ENUM ('completada', 'reembolsada');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "revendedor_id" UUID;

-- AlterTable
ALTER TABLE "planes" ADD COLUMN     "costo_usd" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "suscripciones" ADD COLUMN     "revendedor_id" UUID;

-- CreateTable
CREATE TABLE "niveles_revendedor" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(300),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "niveles_revendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revendedores" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "EstadoRevendedor" NOT NULL DEFAULT 'solicitud',
    "nivel_id" UUID,
    "nombre_comercial" VARCHAR(120) NOT NULL,
    "documento" VARCHAR(40),
    "telefono" VARCHAR(20),
    "pais" CHAR(2),
    "mensaje" VARCHAR(1000),
    "motivo_estado" VARCHAR(500),
    "saldo_usd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "limite_diario_compras" INTEGER,
    "revisado_por_id" UUID,
    "revisado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_mayoristas" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "nivel_id" UUID NOT NULL,
    "precio_usd" DECIMAL(14,2) NOT NULL,
    "actualizado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "precios_mayoristas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recargas_saldo" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(20) NOT NULL,
    "revendedor_id" UUID NOT NULL,
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

    CONSTRAINT "recargas_saldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_saldo" (
    "id" UUID NOT NULL,
    "revendedor_id" UUID NOT NULL,
    "tipo" "TipoMovimientoSaldo" NOT NULL,
    "monto_usd" DECIMAL(14,2) NOT NULL,
    "saldo_resultante_usd" DECIMAL(14,2) NOT NULL,
    "recarga_id" UUID,
    "compra_id" UUID,
    "motivo" VARCHAR(500),
    "autor_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_saldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_revendedor" (
    "id" UUID NOT NULL,
    "revendedor_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "suscripcion_id" UUID NOT NULL,
    "tipo" "TipoCompra" NOT NULL,
    "precio_usd" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoCompra" NOT NULL DEFAULT 'completada',
    "clave_idempotencia" VARCHAR(64) NOT NULL,
    "motivo_reembolso" VARCHAR(500),
    "reembolsada_por_id" UUID,
    "reembolsada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_revendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paginas" (
    "id" UUID NOT NULL,
    "ruta" VARCHAR(80) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300),
    "borrador" JSONB NOT NULL DEFAULT '[]',
    "borrador_actualizado_en" TIMESTAMPTZ(3),
    "borrador_por_id" UUID,
    "version_publicada_id" UUID,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paginas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versiones_pagina" (
    "id" UUID NOT NULL,
    "pagina_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300),
    "contenido" JSONB NOT NULL,
    "nota" VARCHAR(200),
    "publicada_por_id" UUID,
    "publicada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versiones_pagina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medios" (
    "id" UUID NOT NULL,
    "archivo_id" UUID NOT NULL,
    "texto_alternativo" VARCHAR(200) NOT NULL,
    "subido_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tema_sitio" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paleta" VARCHAR(30) NOT NULL DEFAULT 'nv',
    "actualizado_por_id" UUID,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tema_sitio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "niveles_revendedor_nombre_key" ON "niveles_revendedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "revendedores_usuario_id_key" ON "revendedores"("usuario_id");

-- CreateIndex
CREATE INDEX "revendedores_estado_creado_en_idx" ON "revendedores"("estado", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "precios_mayoristas_plan_id_nivel_id_key" ON "precios_mayoristas"("plan_id", "nivel_id");

-- CreateIndex
CREATE UNIQUE INDEX "recargas_saldo_referencia_key" ON "recargas_saldo"("referencia");

-- CreateIndex
CREATE INDEX "recargas_saldo_estado_creado_en_idx" ON "recargas_saldo"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "recargas_saldo_revendedor_id_creado_en_idx" ON "recargas_saldo"("revendedor_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_saldo_recarga_id_key" ON "movimientos_saldo"("recarga_id");

-- CreateIndex
CREATE INDEX "movimientos_saldo_revendedor_id_creado_en_idx" ON "movimientos_saldo"("revendedor_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "movimientos_saldo_compra_id_idx" ON "movimientos_saldo"("compra_id");

-- CreateIndex
CREATE INDEX "compras_revendedor_revendedor_id_creado_en_idx" ON "compras_revendedor"("revendedor_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "compras_revendedor_revendedor_id_clave_idempotencia_key" ON "compras_revendedor"("revendedor_id", "clave_idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "paginas_ruta_key" ON "paginas"("ruta");

-- CreateIndex
CREATE UNIQUE INDEX "paginas_version_publicada_id_key" ON "paginas"("version_publicada_id");

-- CreateIndex
CREATE UNIQUE INDEX "versiones_pagina_pagina_id_numero_key" ON "versiones_pagina"("pagina_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "medios_archivo_id_key" ON "medios"("archivo_id");

-- CreateIndex
CREATE INDEX "clientes_revendedor_id_idx" ON "clientes"("revendedor_id");

-- CreateIndex
CREATE INDEX "suscripciones_revendedor_id_estado_idx" ON "suscripciones"("revendedor_id", "estado");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revendedores" ADD CONSTRAINT "revendedores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revendedores" ADD CONSTRAINT "revendedores_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "niveles_revendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revendedores" ADD CONSTRAINT "revendedores_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_mayoristas" ADD CONSTRAINT "precios_mayoristas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_mayoristas" ADD CONSTRAINT "precios_mayoristas_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "niveles_revendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_mayoristas" ADD CONSTRAINT "precios_mayoristas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_saldo_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_saldo_metodo_cobro_id_fkey" FOREIGN KEY ("metodo_cobro_id") REFERENCES "metodos_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_saldo_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_saldo_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_recarga_id_fkey" FOREIGN KEY ("recarga_id") REFERENCES "recargas_saldo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_revendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_revendedor_revendedor_id_fkey" FOREIGN KEY ("revendedor_id") REFERENCES "revendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_revendedor_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_revendedor_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_revendedor_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_revendedor_reembolsada_por_id_fkey" FOREIGN KEY ("reembolsada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paginas" ADD CONSTRAINT "paginas_borrador_por_id_fkey" FOREIGN KEY ("borrador_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paginas" ADD CONSTRAINT "paginas_version_publicada_id_fkey" FOREIGN KEY ("version_publicada_id") REFERENCES "versiones_pagina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_pagina" ADD CONSTRAINT "versiones_pagina_pagina_id_fkey" FOREIGN KEY ("pagina_id") REFERENCES "paginas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_pagina" ADD CONSTRAINT "versiones_pagina_publicada_por_id_fkey" FOREIGN KEY ("publicada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medios" ADD CONSTRAINT "medios_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medios" ADD CONSTRAINT "medios_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tema_sitio" ADD CONSTRAINT "tema_sitio_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Reglas que la base de datos garantiza por sí misma ──────────────────────

-- El saldo nunca puede quedar negativo, ni los precios en cero o negativos.
ALTER TABLE "revendedores" ADD CONSTRAINT "revendedores_saldo_no_negativo" CHECK ("saldo_usd" >= 0);
ALTER TABLE "revendedores" ADD CONSTRAINT "revendedores_limite_diario_positivo" CHECK ("limite_diario_compras" IS NULL OR "limite_diario_compras" > 0);
ALTER TABLE "precios_mayoristas" ADD CONSTRAINT "precios_mayoristas_positivo" CHECK ("precio_usd" > 0);
ALTER TABLE "planes" ADD CONSTRAINT "planes_costo_no_negativo" CHECK ("costo_usd" IS NULL OR "costo_usd" >= 0);
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_montos_positivos" CHECK ("monto_declarado" > 0 AND ("monto_recibido" IS NULL OR "monto_recibido" > 0) AND ("monto_usd" IS NULL OR "monto_usd" > 0) AND "tasa" > 0);
ALTER TABLE "recargas_saldo" ADD CONSTRAINT "recargas_confirmada_con_monto" CHECK ("estado" <> 'confirmada' OR ("monto_usd" IS NOT NULL AND "monto_recibido" IS NOT NULL));
ALTER TABLE "compras_revendedor" ADD CONSTRAINT "compras_precio_positivo" CHECK ("precio_usd" > 0);

-- Cada tipo de movimiento con su signo, y el saldo resultante nunca negativo.
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_signo" CHECK (
  ("tipo" IN ('recarga', 'reembolso') AND "monto_usd" > 0)
  OR ("tipo" = 'compra' AND "monto_usd" < 0)
  OR ("tipo" = 'ajuste' AND "monto_usd" <> 0 AND "motivo" IS NOT NULL)
);
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_resultante" CHECK ("saldo_resultante_usd" >= 0);
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_referencias" CHECK (
  ("tipo" = 'recarga' AND "recarga_id" IS NOT NULL)
  OR ("tipo" IN ('compra', 'reembolso') AND "compra_id" IS NOT NULL)
  OR "tipo" = 'ajuste'
);
-- Una compra se cobra una vez y se reembolsa como mucho una vez.
CREATE UNIQUE INDEX "movimientos_una_compra" ON "movimientos_saldo" ("compra_id") WHERE "tipo" = 'compra';
CREATE UNIQUE INDEX "movimientos_un_reembolso" ON "movimientos_saldo" ("compra_id") WHERE "tipo" = 'reembolso';

-- El libro mayor es de solo inserción.
CREATE FUNCTION "movimientos_saldo_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de saldo no se pueden modificar ni borrar; registra un ajuste.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "movimientos_saldo_sin_cambios" BEFORE UPDATE OR DELETE ON "movimientos_saldo"
  FOR EACH ROW EXECUTE FUNCTION "movimientos_saldo_inmutable"();

-- Las versiones publicadas del sitio tampoco cambian.
CREATE FUNCTION "versiones_pagina_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones publicadas no se pueden modificar ni borrar; publica una nueva.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "versiones_pagina_sin_cambios" BEFORE UPDATE OR DELETE ON "versiones_pagina"
  FOR EACH ROW EXECUTE FUNCTION "versiones_pagina_inmutable"();

-- Rutas de páginas: minúsculas, números y guiones, empezando por "/".
ALTER TABLE "paginas" ADD CONSTRAINT "paginas_ruta_valida" CHECK ("ruta" ~ '^/([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$');
ALTER TABLE "tema_sitio" ADD CONSTRAINT "tema_sitio_una_fila" CHECK ("id" = 1);
