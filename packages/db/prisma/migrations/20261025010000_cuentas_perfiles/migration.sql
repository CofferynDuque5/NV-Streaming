-- Gestor G2: cuentas de servicio y sus perfiles, con credenciales cifradas.
-- CreateEnum
CREATE TYPE "EstadoCuentaServicio" AS ENUM ('activa', 'caida', 'retirada');

-- CreateEnum
CREATE TYPE "ModoCuenta" AS ENUM ('perfiles', 'completa');

-- CreateEnum
CREATE TYPE "EstadoPerfil" AS ENUM ('libre', 'asignado', 'bloqueado');

-- CreateTable
CREATE TABLE "cuentas_servicio" (
    "id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "usuario_cifrado" VARCHAR(1000) NOT NULL,
    "usuario_huella" CHAR(64) NOT NULL,
    "pista" VARCHAR(120) NOT NULL,
    "clave_cifrada" VARCHAR(1000) NOT NULL,
    "modo" "ModoCuenta" NOT NULL DEFAULT 'perfiles',
    "estado" "EstadoCuentaServicio" NOT NULL DEFAULT 'activa',
    "plan" VARCHAR(60),
    "pais" CHAR(2),
    "costo_usd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "factura_en" DATE,
    "metodo_pago" VARCHAR(60),
    "proveedor" VARCHAR(120),
    "notas" VARCHAR(1000),
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuentas_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfiles_cuenta" (
    "id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "pin_cifrado" VARCHAR(500),
    "estado" "EstadoPerfil" NOT NULL DEFAULT 'libre',
    "suscripcion_id" UUID,
    "asignado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "perfiles_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_servicio_usuario_huella_key" ON "cuentas_servicio"("usuario_huella");

-- CreateIndex
CREATE INDEX "cuentas_servicio_servicio_id_estado_idx" ON "cuentas_servicio"("servicio_id", "estado");

-- CreateIndex
CREATE INDEX "cuentas_servicio_estado_factura_en_idx" ON "cuentas_servicio"("estado", "factura_en");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_cuenta_suscripcion_id_key" ON "perfiles_cuenta"("suscripcion_id");

-- CreateIndex
CREATE INDEX "perfiles_cuenta_cuenta_id_estado_idx" ON "perfiles_cuenta"("cuenta_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_cuenta_cuenta_id_numero_key" ON "perfiles_cuenta"("cuenta_id", "numero");

-- AddForeignKey
ALTER TABLE "cuentas_servicio" ADD CONSTRAINT "cuentas_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_servicio" ADD CONSTRAINT "cuentas_servicio_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_cuenta" ADD CONSTRAINT "perfiles_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_cuenta" ADD CONSTRAINT "perfiles_cuenta_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que la base hace cumplir aunque falle la aplicación.
ALTER TABLE "cuentas_servicio"
  ADD CONSTRAINT "cuentas_servicio_costo_no_negativo" CHECK ("costo_usd" >= 0),
  ADD CONSTRAINT "cuentas_servicio_pais_valido" CHECK ("pais" IS NULL OR "pais" ~ '^[A-Z]{2}$');

ALTER TABLE "perfiles_cuenta"
  ADD CONSTRAINT "perfiles_cuenta_numero_valido" CHECK ("numero" BETWEEN 1 AND 20),
  -- Asignado si y solo si tiene suscripción.
  ADD CONSTRAINT "perfiles_cuenta_asignado_con_suscripcion"
    CHECK (("estado" = 'asignado') = ("suscripcion_id" IS NOT NULL));
