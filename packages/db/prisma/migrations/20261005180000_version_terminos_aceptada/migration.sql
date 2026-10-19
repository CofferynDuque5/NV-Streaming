-- Versión de las Políticas y términos que aceptó cada cliente al registrarse.
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "terminos_aceptados_en" TIMESTAMPTZ(3),
ADD COLUMN     "terminos_version" VARCHAR(20);
