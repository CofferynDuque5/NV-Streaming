-- Binance Pay confirmado por correo. Solo agrega columnas y tablas: no cambia ni borra datos.
ALTER TABLE "intentos_pago" ADD COLUMN "pagador_declarado" VARCHAR(80),
ADD COLUMN "monto_declarado" DECIMAL(14,2),
ADD COLUMN "declarado_en" TIMESTAMPTZ(3),
ADD COLUMN "aviso_equipo_en" TIMESTAMPTZ(3);

CREATE TABLE "config_binance" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" VARCHAR(120) NOT NULL DEFAULT 'imap.gmail.com',
    "puerto" INTEGER NOT NULL DEFAULT 993,
    "usuario_cifrado" VARCHAR(1000) NOT NULL,
    "pista" VARCHAR(120) NOT NULL,
    "clave_cifrada" VARCHAR(1000) NOT NULL,
    "carpeta" VARCHAR(120) NOT NULL DEFAULT 'NV-Binance',
    "codigo_cifrado" VARCHAR(1000),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_uid" BIGINT,
    "uid_validez" BIGINT,
    "probado_en" TIMESTAMPTZ(3),
    "ultima_lectura" TIMESTAMPTZ(3),
    "ultimo_error" VARCHAR(300),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "config_binance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "config_binance_una_fila" CHECK ("id" = 1)
);

CREATE TABLE "correos_binance" (
    "id" UUID NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "remitente" VARCHAR(80),
    "monto" DECIMAL(14,2),
    "moneda" VARCHAR(10),
    "pagado_en" TIMESTAMPTZ(3),
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'libre',
    "motivo" VARCHAR(200),
    "intento_id" UUID,
    CONSTRAINT "correos_binance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correos_binance_huella_key" ON "correos_binance"("huella");
CREATE UNIQUE INDEX "correos_binance_intento_id_key" ON "correos_binance"("intento_id");
CREATE INDEX "correos_binance_estado_remitente_monto_idx" ON "correos_binance"("estado", "remitente", "monto");
CREATE INDEX "correos_binance_recibido_en_idx" ON "correos_binance"("recibido_en" DESC);

ALTER TABLE "correos_binance" ADD CONSTRAINT "correos_binance_intento_id_fkey" FOREIGN KEY ("intento_id") REFERENCES "intentos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
