-- Requisito y beneficios de cada nivel de revendedor (además de sus precios).
ALTER TABLE "niveles_revendedor" ADD COLUMN "requisito" VARCHAR(200);
ALTER TABLE "niveles_revendedor" ADD COLUMN "beneficios" TEXT[] DEFAULT ARRAY[]::TEXT[];
