-- Conector con el panel de un proveedor de cuentas (ikercuentas.com). Solo agrega una tabla.
CREATE TABLE "conectores_codigos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "url_base" VARCHAR(200) NOT NULL,
    "usuario_cifrado" VARCHAR(1000),
    "pista" VARCHAR(120),
    "clave_cifrada" VARCHAR(1000),
    "sesion_cifrada" TEXT,
    "marca_proveedor" VARCHAR(60) NOT NULL,
    "buzon_id" UUID,
    "carpeta_aprobacion" VARCHAR(120) NOT NULL DEFAULT 'INBOX',
    "remitente_aprobacion" VARCHAR(254) NOT NULL,
    "acciones_cliente" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'sin_probar',
    "ultimo_error" VARCHAR(300),
    "probado_en" TIMESTAMPTZ(3),
    "diagnostico" JSONB,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conectores_codigos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conectores_codigos_nombre_key" ON "conectores_codigos"("nombre");

ALTER TABLE "conectores_codigos" ADD CONSTRAINT "conectores_codigos_buzon_id_fkey" FOREIGN KEY ("buzon_id") REFERENCES "buzones_codigos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
