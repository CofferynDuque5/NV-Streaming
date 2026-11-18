-- Plan familiar: correo y clave propios del miembro de cada cupo (cifrados).
ALTER TABLE "perfiles_cuenta" ADD COLUMN "usuario_miembro_cifrado" VARCHAR(1000);
ALTER TABLE "perfiles_cuenta" ADD COLUMN "clave_miembro_cifrada" VARCHAR(1000);

-- Clientes que escriben por Telegram.
ALTER TYPE "TipoContacto" ADD VALUE 'telegram';
