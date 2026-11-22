-- Imagen adjunta en los mensajes de soporte. Solo agrega una columna opcional: no cambia ni borra datos.
ALTER TABLE "mensajes_ticket" ADD COLUMN "imagen_id" UUID;
ALTER TABLE "mensajes_ticket" ADD CONSTRAINT "mensajes_ticket_imagen_id_fkey" FOREIGN KEY ("imagen_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
