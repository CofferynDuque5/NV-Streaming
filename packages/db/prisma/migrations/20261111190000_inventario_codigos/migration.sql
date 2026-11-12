-- AlterTable
ALTER TABLE "perfiles_cuenta" ADD COLUMN     "nota" VARCHAR(120);

-- CreateTable
CREATE TABLE "buzones_codigos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "host" VARCHAR(120) NOT NULL,
    "puerto" INTEGER NOT NULL DEFAULT 993,
    "seguro" BOOLEAN NOT NULL DEFAULT true,
    "usuario_cifrado" VARCHAR(1000) NOT NULL,
    "pista" VARCHAR(120) NOT NULL,
    "clave_cifrada" VARCHAR(1000) NOT NULL,
    "carpeta" VARCHAR(120) NOT NULL DEFAULT 'INBOX',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "probado_en" TIMESTAMPTZ(3),
    "ultimo_error" VARCHAR(300),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buzones_codigos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asuntos_codigo" (
    "id" UUID NOT NULL,
    "servicio_id" UUID NOT NULL,
    "asunto" VARCHAR(160) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asuntos_codigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas_codigo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "cuenta_id" UUID,
    "resultado" VARCHAR(20) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultas_codigo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buzones_codigos_nombre_key" ON "buzones_codigos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "asuntos_codigo_servicio_id_asunto_key" ON "asuntos_codigo"("servicio_id", "asunto");

-- CreateIndex
CREATE INDEX "consultas_codigo_usuario_id_creado_en_idx" ON "consultas_codigo"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "consultas_codigo_creado_en_idx" ON "consultas_codigo"("creado_en");

-- AddForeignKey
ALTER TABLE "asuntos_codigo" ADD CONSTRAINT "asuntos_codigo_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

