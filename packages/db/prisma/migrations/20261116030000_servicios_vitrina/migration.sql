-- Presentación de cada servicio en la tienda (insignias, preguntas, fondo, cartelera…).
ALTER TABLE "servicios" ADD COLUMN "vitrina" JSONB NOT NULL DEFAULT '{}';
