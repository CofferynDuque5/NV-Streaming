-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('USD', 'VES', 'ARS', 'COP', 'PEN', 'EUR');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('activo', 'archivado');

-- CreateEnum
CREATE TYPE "TipoContacto" AS ENUM ('correo', 'whatsapp', 'telefono');

-- CreateEnum
CREATE TYPE "TipoProveedor" AS ENUM ('propio', 'distribuidor');

-- CreateEnum
CREATE TYPE "UnidadDuracion" AS ENUM ('dia', 'mes');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('pendiente_pago', 'activa', 'en_gracia', 'pausada', 'suspendida', 'vencida', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoEventoSuscripcion" AS ENUM ('alta', 'activacion', 'renovacion', 'pausa', 'reanudacion', 'cancelacion', 'cancelacion_programada', 'cancelacion_revertida', 'vencimiento', 'suspension', 'recuperacion');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('emitida', 'pagada', 'anulada');

-- CreateEnum
CREATE TYPE "ConceptoFactura" AS ENUM ('alta', 'renovacion');

-- CreateEnum
CREATE TYPE "TipoCupon" AS ENUM ('porcentaje', 'monto');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('en_revision', 'confirmado', 'rechazado');

-- CreateEnum
CREATE TYPE "EstadoTicket" AS ENUM ('abierto', 'en_progreso', 'esperando_cliente', 'resuelto', 'cerrado');

-- CreateEnum
CREATE TYPE "PrioridadTicket" AS ENUM ('baja', 'normal', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "CategoriaTicket" AS ENUM ('pagos', 'acceso', 'suscripcion', 'cuenta', 'otro');

-- CreateTable
CREATE TABLE "tasas_cambio" (
    "id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "vigente_desde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autor_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasas_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodos_cobro" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "instrucciones" VARCHAR(2000) NOT NULL,
    "requiere_referencia" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "metodos_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "nombre" VARCHAR(120) NOT NULL,
    "correo" VARCHAR(254),
    "documento" VARCHAR(40),
    "pais" CHAR(2),
    "moneda_preferida" "Moneda" NOT NULL DEFAULT 'USD',
    "estado" "EstadoCliente" NOT NULL DEFAULT 'activo',
    "asignado_a_id" UUID,
    "origen" VARCHAR(30) NOT NULL DEFAULT 'equipo',
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos_cliente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo" "TipoContacto" NOT NULL,
    "valor" VARCHAR(254) NOT NULL,
    "consentimiento_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contactos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_internas" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "texto" VARCHAR(2000) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_internas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "tipo" "TipoProveedor" NOT NULL,
    "adaptador" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "permite_reventa" BOOLEAN NOT NULL DEFAULT false,
    "notas_acuerdo" VARCHAR(2000),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(1000),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes" (
    "id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(1000),
    "precio_usd" DECIMAL(14,2) NOT NULL,
    "duracion_cantidad" INTEGER NOT NULL,
    "duracion_unidad" "UnidadDuracion" NOT NULL,
    "beneficios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "renovable" BOOLEAN NOT NULL DEFAULT true,
    "revendible" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_fijos" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "precios_fijos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_precios" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "anterior" DECIMAL(14,2),
    "nuevo" DECIMAL(14,2),
    "autor_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suscripciones" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'pendiente_pago',
    "moneda" "Moneda" NOT NULL,
    "inicio_en" TIMESTAMPTZ(3),
    "vence_en" TIMESTAMPTZ(3),
    "pausada_en" TIMESTAMPTZ(3),
    "segundos_restantes" INTEGER,
    "cancelar_al_vencer" BOOLEAN NOT NULL DEFAULT false,
    "cancelada_en" TIMESTAMPTZ(3),
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_suscripcion" (
    "id" UUID NOT NULL,
    "suscripcion_id" UUID NOT NULL,
    "tipo" "TipoEventoSuscripcion" NOT NULL,
    "actor_id" UUID,
    "motivo" VARCHAR(500),
    "datos" JSONB,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "suscripcion_id" UUID,
    "concepto" "ConceptoFactura" NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'emitida',
    "moneda" "Moneda" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "tasa" DECIMAL(18,6) NOT NULL,
    "total_usd" DECIMAL(14,2) NOT NULL,
    "cupon_id" UUID,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "pagada_en" TIMESTAMPTZ(3),
    "anulada_en" TIMESTAMPTZ(3),
    "motivo_anulacion" VARCHAR(500),
    "anulada_por_id" UUID,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_factura" (
    "id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "plan_id" UUID,
    "descripcion" VARCHAR(200) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "lineas_factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupones" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "tipo" "TipoCupon" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "valido_desde" TIMESTAMPTZ(3),
    "valido_hasta" TIMESTAMPTZ(3),
    "usos_maximos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "solo_altas" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cupones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupones_planes" (
    "cupon_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "cupones_planes_pkey" PRIMARY KEY ("cupon_id","plan_id")
);

-- CreateTable
CREATE TABLE "canjes_cupon" (
    "id" UUID NOT NULL,
    "cupon_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canjes_cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" UUID NOT NULL,
    "nombre_original" VARCHAR(200) NOT NULL,
    "tipo_mime" VARCHAR(60) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "clave" VARCHAR(200) NOT NULL,
    "subido_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(20) NOT NULL,
    "factura_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "metodo_cobro_id" UUID NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "monto_declarado" DECIMAL(14,2) NOT NULL,
    "monto_recibido" DECIMAL(14,2),
    "referencia_externa" VARCHAR(80),
    "fecha_pago" TIMESTAMPTZ(3) NOT NULL,
    "comprobante_id" UUID,
    "estado" "EstadoPago" NOT NULL DEFAULT 'en_revision',
    "motivo_rechazo" VARCHAR(500),
    "notas_conciliacion" VARCHAR(500),
    "revisado_por_id" UUID,
    "revisado_en" TIMESTAMPTZ(3),
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "suscripcion_id" UUID,
    "asunto" VARCHAR(160) NOT NULL,
    "categoria" "CategoriaTicket" NOT NULL,
    "prioridad" "PrioridadTicket" NOT NULL DEFAULT 'normal',
    "estado" "EstadoTicket" NOT NULL DEFAULT 'abierto',
    "asignado_a_id" UUID,
    "sla_primera_respuesta" TIMESTAMPTZ(3) NOT NULL,
    "primera_respuesta_en" TIMESTAMPTZ(3),
    "resuelto_en" TIMESTAMPTZ(3),
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_ticket" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "texto" VARCHAR(5000) NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasas_cambio_moneda_vigente_desde_idx" ON "tasas_cambio"("moneda", "vigente_desde" DESC);

-- CreateIndex
CREATE INDEX "metodos_cobro_moneda_activo_idx" ON "metodos_cobro"("moneda", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_usuario_id_key" ON "clientes"("usuario_id");

-- CreateIndex
CREATE INDEX "clientes_estado_creado_en_idx" ON "clientes"("estado", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "clientes_asignado_a_id_idx" ON "clientes"("asignado_a_id");

-- CreateIndex
CREATE INDEX "clientes_correo_idx" ON "clientes"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_cliente_cliente_id_tipo_valor_key" ON "contactos_cliente"("cliente_id", "tipo", "valor");

-- CreateIndex
CREATE INDEX "notas_internas_cliente_id_creado_en_idx" ON "notas_internas"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nombre_key" ON "proveedores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_slug_key" ON "servicios"("slug");

-- CreateIndex
CREATE INDEX "planes_activo_visible_orden_idx" ON "planes"("activo", "visible", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "precios_fijos_plan_id_moneda_key" ON "precios_fijos"("plan_id", "moneda");

-- CreateIndex
CREATE INDEX "historial_precios_plan_id_creado_en_idx" ON "historial_precios"("plan_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "suscripciones_cliente_id_estado_idx" ON "suscripciones"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "suscripciones_estado_vence_en_idx" ON "suscripciones"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "eventos_suscripcion_suscripcion_id_creado_en_idx" ON "eventos_suscripcion"("suscripcion_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "facturas_numero_key" ON "facturas"("numero");

-- CreateIndex
CREATE INDEX "facturas_cliente_id_creado_en_idx" ON "facturas"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "facturas_estado_vence_en_idx" ON "facturas"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "facturas_suscripcion_id_idx" ON "facturas"("suscripcion_id");

-- CreateIndex
CREATE INDEX "lineas_factura_factura_id_idx" ON "lineas_factura"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "cupones_codigo_key" ON "cupones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "canjes_cupon_factura_id_key" ON "canjes_cupon"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "canjes_cupon_cupon_id_cliente_id_key" ON "canjes_cupon"("cupon_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "archivos_clave_key" ON "archivos"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_referencia_key" ON "pagos"("referencia");

-- CreateIndex
CREATE INDEX "pagos_estado_creado_en_idx" ON "pagos"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "pagos_factura_id_idx" ON "pagos"("factura_id");

-- CreateIndex
CREATE INDEX "pagos_cliente_id_creado_en_idx" ON "pagos"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_numero_key" ON "tickets"("numero");

-- CreateIndex
CREATE INDEX "tickets_estado_prioridad_creado_en_idx" ON "tickets"("estado", "prioridad", "creado_en");

-- CreateIndex
CREATE INDEX "tickets_cliente_id_creado_en_idx" ON "tickets"("cliente_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "tickets_asignado_a_id_estado_idx" ON "tickets"("asignado_a_id", "estado");

-- CreateIndex
CREATE INDEX "mensajes_ticket_ticket_id_creado_en_idx" ON "mensajes_ticket"("ticket_id", "creado_en");

-- AddForeignKey
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_asignado_a_id_fkey" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos_cliente" ADD CONSTRAINT "contactos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes" ADD CONSTRAINT "planes_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_fijos" ADD CONSTRAINT "precios_fijos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_suscripcion" ADD CONSTRAINT "eventos_suscripcion_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_suscripcion" ADD CONSTRAINT "eventos_suscripcion_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupones_planes" ADD CONSTRAINT "cupones_planes_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupones_planes" ADD CONSTRAINT "cupones_planes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canjes_cupon" ADD CONSTRAINT "canjes_cupon_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canjes_cupon" ADD CONSTRAINT "canjes_cupon_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canjes_cupon" ADD CONSTRAINT "canjes_cupon_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_metodo_cobro_id_fkey" FOREIGN KEY ("metodo_cobro_id") REFERENCES "metodos_cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asignado_a_id_fkey" FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_ticket" ADD CONSTRAINT "mensajes_ticket_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_ticket" ADD CONSTRAINT "mensajes_ticket_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Integridad del dinero y de los estados que Prisma no expresa.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_no_usd" CHECK ("moneda" <> 'USD');
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_correo_minusculas" CHECK ("correo" IS NULL OR "correo" = lower("correo"));
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_pais_iso" CHECK ("pais" IS NULL OR "pais" ~ '^[A-Z]{2}$');
ALTER TABLE "planes" ADD CONSTRAINT "planes_precio_no_negativo" CHECK ("precio_usd" >= 0);
ALTER TABLE "planes" ADD CONSTRAINT "planes_duracion_positiva" CHECK ("duracion_cantidad" > 0);
ALTER TABLE "precios_fijos" ADD CONSTRAINT "precios_fijos_no_negativo" CHECK ("precio" >= 0);
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_importes_validos"
  CHECK ("subtotal" >= 0 AND "descuento" >= 0 AND "descuento" <= "subtotal" AND "total" = "subtotal" - "descuento" AND "tasa" > 0 AND "total_usd" >= 0);
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_validas" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0 AND "total" >= 0);
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_valor_valido"
  CHECK ("valor" > 0 AND ("tipo" <> 'porcentaje' OR "valor" <= 100));
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_usos_validos"
  CHECK ("usos" >= 0 AND ("usos_maximos" IS NULL OR ("usos_maximos" > 0 AND "usos" <= "usos_maximos")));
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_codigo_mayusculas" CHECK ("codigo" = upper("codigo"));
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_vigencia" CHECK ("valido_desde" IS NULL OR "valido_hasta" IS NULL OR "valido_hasta" > "valido_desde");
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_montos_positivos"
  CHECK ("monto_declarado" > 0 AND ("monto_recibido" IS NULL OR "monto_recibido" >= 0));
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_tamano_positivo" CHECK ("tamano" > 0);

-- Una factura pagada tiene exactamente un pago confirmado; nunca dos.
CREATE UNIQUE INDEX "pagos_un_confirmado_por_factura" ON "pagos"("factura_id") WHERE "estado" = 'confirmado';
-- Una suscripción no puede tener dos facturas abiertas a la vez.
CREATE UNIQUE INDEX "facturas_una_abierta_por_suscripcion" ON "facturas"("suscripcion_id") WHERE "estado" = 'emitida';
