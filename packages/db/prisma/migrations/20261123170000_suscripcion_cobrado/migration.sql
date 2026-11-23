-- Marca de «Cobrado» en Vencimientos y Cortes: cuándo y quién le cobró a mano
-- por WhatsApp o Telegram. Solo agrega columnas vacías: no cambia ni borra datos.
ALTER TABLE "suscripciones"
  ADD COLUMN "cobrado_en" TIMESTAMPTZ(3),
  ADD COLUMN "cobrado_por_id" UUID;
