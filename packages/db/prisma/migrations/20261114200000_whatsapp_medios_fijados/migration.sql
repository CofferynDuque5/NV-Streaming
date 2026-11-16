-- Bandeja de WhatsApp: imágenes y audios, conversaciones y mensajes fijados.
-- Solo agrega columnas opcionales: no toca lo que ya está guardado.
ALTER TABLE "conversaciones_whatsapp" ADD COLUMN "fijada_en" TIMESTAMPTZ(3);

ALTER TABLE "mensajes_whatsapp"
  ADD COLUMN "medio_clave" VARCHAR(80),
  ADD COLUMN "medio_mime" VARCHAR(100),
  ADD COLUMN "medio_segundos" INTEGER,
  ADD COLUMN "medio_ref" TEXT,
  ADD COLUMN "fijado_en" TIMESTAMPTZ(3);
