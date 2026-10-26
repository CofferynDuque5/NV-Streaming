-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('admin', 'operador', 'ventas', 'revendedor', 'cliente');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('activo', 'suspendido');

-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('verificar_correo', 'recuperar_contrasena', 'invitacion');

-- CreateEnum
CREATE TYPE "TipoActor" AS ENUM ('usuario', 'ia', 'sistema');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "correo" VARCHAR(254) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "hash_contrasena" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'cliente',
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'activo',
    "correo_verificado_en" TIMESTAMPTZ(3),
    "totp_secreto" TEXT,
    "totp_secreto_pendiente" TEXT,
    "totp_activado_en" TIMESTAMPTZ(3),
    "totp_ultimo_paso" BIGINT,
    "ultimo_acceso_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "dos_pasos_completo" BOOLEAN NOT NULL DEFAULT false,
    "ip" VARCHAR(64),
    "agente_usuario" VARCHAR(400),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada_en" TIMESTAMPTZ(3),

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_un_uso" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoToken" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_un_uso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_respaldo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "codigo_hash" CHAR(64) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_tipo" "TipoActor" NOT NULL,
    "actor_id" UUID,
    "accion" VARCHAR(80) NOT NULL,
    "entidad" VARCHAR(80) NOT NULL,
    "entidad_id" VARCHAR(64),
    "antes" JSONB,
    "despues" JSONB,
    "ip" VARCHAR(64),
    "id_peticion" VARCHAR(64),

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limites_uso" (
    "clave" VARCHAR(200) NOT NULL,
    "ventana_inicio" TIMESTAMPTZ(3) NOT NULL,
    "conteo" INTEGER NOT NULL,

    CONSTRAINT "limites_uso_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "correos_salientes" (
    "id" UUID NOT NULL,
    "para" VARCHAR(254) NOT NULL,
    "asunto" VARCHAR(200) NOT NULL,
    "plantilla" VARCHAR(60) NOT NULL,
    "proveedor" VARCHAR(30) NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "texto" TEXT,
    "error" VARCHAR(500),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correos_salientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE INDEX "usuarios_rol_estado_idx" ON "usuarios"("rol", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_revocada_en_idx" ON "sesiones"("usuario_id", "revocada_en");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_un_uso_token_hash_key" ON "tokens_un_uso"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_un_uso_usuario_id_tipo_idx" ON "tokens_un_uso"("usuario_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_respaldo_usuario_id_codigo_hash_key" ON "codigos_respaldo"("usuario_id", "codigo_hash");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha" DESC);

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_actor_id_idx" ON "auditoria"("actor_id");

-- CreateIndex
CREATE INDEX "auditoria_accion_idx" ON "auditoria"("accion");

-- CreateIndex
CREATE INDEX "limites_uso_ventana_inicio_idx" ON "limites_uso"("ventana_inicio");

-- CreateIndex
CREATE INDEX "correos_salientes_para_creado_en_idx" ON "correos_salientes"("para", "creado_en" DESC);

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_un_uso" ADD CONSTRAINT "tokens_un_uso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_respaldo" ADD CONSTRAINT "codigos_respaldo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría de solo inserción: ninguna fila se puede modificar ni borrar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El registro de auditoría es de solo inserción (operación % bloqueada)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER auditoria_sin_modificaciones
  BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

CREATE TRIGGER auditoria_sin_vaciado
  BEFORE TRUNCATE ON "auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();

-- Integridad básica que Prisma no expresa.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_correo_minusculas" CHECK ("correo" = lower("correo"));
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_expira_despues" CHECK ("expira_en" > "creada_en");
ALTER TABLE "limites_uso" ADD CONSTRAINT "limites_uso_conteo_positivo" CHECK ("conteo" > 0);
