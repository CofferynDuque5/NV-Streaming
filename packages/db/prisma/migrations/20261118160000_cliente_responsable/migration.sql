-- Responsable del cliente (el revendedor que lo trajo), como en el Gestor. Texto libre.
ALTER TABLE "clientes" ADD COLUMN "responsable" VARCHAR(60);
CREATE INDEX "clientes_responsable_idx" ON "clientes" ("responsable");
