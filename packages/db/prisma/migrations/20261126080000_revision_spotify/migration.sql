-- Revisión automática de cuentas Spotify principales. Solo agrega una tabla.
CREATE TABLE "revisiones_spotify" (
    "cuenta_id" UUID NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'en_cola',
    "situacion" VARCHAR(20),
    "plan" VARCHAR(80),
    "vencimiento" DATE,
    "cupos_usados" INTEGER,
    "cupos_total" INTEGER,
    "fecha_anterior" DATE,
    "fecha_aplicada" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_error" VARCHAR(300),
    "diagnostico" JSONB,
    "sesion_cifrada" TEXT,
    "pedida_por_id" UUID,
    "revisada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revisiones_spotify_pkey" PRIMARY KEY ("cuenta_id")
);

ALTER TABLE "revisiones_spotify" ADD CONSTRAINT "revisiones_spotify_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
