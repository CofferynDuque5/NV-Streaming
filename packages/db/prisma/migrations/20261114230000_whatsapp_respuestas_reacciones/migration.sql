-- Bandeja de WhatsApp: respuestas citadas, reacciones, mensajes borrados y editados.
-- Solo agrega columnas opcionales: no toca lo que ya está guardado.
ALTER TABLE "mensajes_whatsapp"
  ADD COLUMN "respuesta_de_id" UUID,
  ADD COLUMN "reaccion_cliente" VARCHAR(16),
  ADD COLUMN "reaccion_equipo" VARCHAR(16),
  ADD COLUMN "eliminado_en" TIMESTAMPTZ(3),
  ADD COLUMN "editado_en" TIMESTAMPTZ(3);

ALTER TABLE "mensajes_whatsapp"
  ADD CONSTRAINT "mensajes_whatsapp_respuesta_de_id_fkey" FOREIGN KEY ("respuesta_de_id")
  REFERENCES "mensajes_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
