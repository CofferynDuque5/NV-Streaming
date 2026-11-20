-- PayPal (cuenta personal) confirmado por correo. Solo agrega columnas y tablas: no cambia ni borra datos.
ALTER TABLE "intentos_pago" ADD COLUMN "comprobante_id" UUID;
ALTER TABLE "intentos_pago" ADD CONSTRAINT "intentos_pago_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "config_paypal_correo" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" VARCHAR(120) NOT NULL DEFAULT 'imap.gmail.com',
    "puerto" INTEGER NOT NULL DEFAULT 993,
    "usuario_cifrado" VARCHAR(1000) NOT NULL,
    "pista" VARCHAR(120) NOT NULL,
    "clave_cifrada" VARCHAR(1000) NOT NULL,
    "carpeta" VARCHAR(120) NOT NULL DEFAULT 'NV-PayPal',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_uid" BIGINT,
    "uid_validez" BIGINT,
    "probado_en" TIMESTAMPTZ(3),
    "ultima_lectura" TIMESTAMPTZ(3),
    "ultimo_error" VARCHAR(300),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "config_paypal_correo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "config_paypal_correo_una_fila" CHECK ("id" = 1)
);

CREATE TABLE "correos_paypal" (
    "id" UUID NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "pagador" VARCHAR(120),
    "monto" DECIMAL(14,2),
    "moneda" VARCHAR(10),
    "id_transaccion" VARCHAR(20),
    "referencia" VARCHAR(20),
    "pagado_en" TIMESTAMPTZ(3),
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'libre',
    "motivo" VARCHAR(200),
    "intento_id" UUID,
    CONSTRAINT "correos_paypal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correos_paypal_huella_key" ON "correos_paypal"("huella");
CREATE UNIQUE INDEX "correos_paypal_intento_id_key" ON "correos_paypal"("intento_id");
CREATE INDEX "correos_paypal_estado_monto_idx" ON "correos_paypal"("estado", "monto");
CREATE INDEX "correos_paypal_referencia_idx" ON "correos_paypal"("referencia");
CREATE INDEX "correos_paypal_recibido_en_idx" ON "correos_paypal"("recibido_en" DESC);

ALTER TABLE "correos_paypal" ADD CONSTRAINT "correos_paypal_intento_id_fkey" FOREIGN KEY ("intento_id") REFERENCES "intentos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
