-- CreateEnum
CREATE TYPE "CategoriaServicio" AS ENUM ('streaming', 'musica', 'ia', 'juegos', 'software', 'nube');

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "categoria" "CategoriaServicio";

