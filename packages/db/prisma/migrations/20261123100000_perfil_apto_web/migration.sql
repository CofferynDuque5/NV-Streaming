-- Revisión manual de lo que la web puede entregar sola: un perfil o cupo libre
-- solo se entrega por la web si el equipo lo revisó y lo marcó como apto.
-- Solo agrega columnas (todas quedan sin marcar) y un disparador: no cambia ni borra datos.
ALTER TABLE "perfiles_cuenta"
  ADD COLUMN "apto_web" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "apto_revisado_en" TIMESTAMPTZ(3),
  ADD COLUMN "apto_revisado_por_id" UUID;

CREATE INDEX "perfiles_cuenta_apto_web_estado_idx" ON "perfiles_cuenta" ("apto_web", "estado");

-- Cuando el perfil cambia de estado (se asigna, se libera, pasa a respaldo o se
-- bloquea) deja de estar apto: hay que revisarlo otra vez antes de venderlo.
CREATE FUNCTION "perfiles_cuenta_apto_al_cambiar"() RETURNS trigger AS $$
BEGIN
  IF NEW."estado" IS DISTINCT FROM OLD."estado" AND NEW."apto_web" = OLD."apto_web" THEN
    NEW."apto_web" := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "perfiles_cuenta_apto_estado" BEFORE UPDATE ON "perfiles_cuenta"
  FOR EACH ROW EXECUTE FUNCTION "perfiles_cuenta_apto_al_cambiar"();
