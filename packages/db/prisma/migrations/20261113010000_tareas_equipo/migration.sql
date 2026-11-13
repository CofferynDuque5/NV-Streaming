-- Tareas delegadas: una nota puede asignarse a alguien del equipo.
ALTER TABLE "notas_internas" ADD COLUMN "asignada_a_id" UUID;

ALTER TABLE "notas_internas"
  ADD CONSTRAINT "notas_internas_asignada_a_id_fkey"
  FOREIGN KEY ("asignada_a_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "notas_internas_asignada_a_id_hecha_en_idx" ON "notas_internas"("asignada_a_id", "hecha_en");
