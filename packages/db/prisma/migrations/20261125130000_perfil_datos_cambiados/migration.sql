-- Qué datos de acceso cambiaron y cuándo (sin valores), para mostrarlo en Mis accesos. Solo agrega.
ALTER TABLE "perfiles_cuenta" ADD COLUMN "datos_cambiados_en" TIMESTAMPTZ(3);
ALTER TABLE "perfiles_cuenta" ADD COLUMN "datos_cambiados" VARCHAR(120);
