-- Caja diaria del Gestor dentro de NV Streaming: cierres de caja de solo inserción.

-- CreateTable
CREATE TABLE "cierres_caja" (
    "id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "hasta" TIMESTAMPTZ(3) NOT NULL,
    "totales" JSONB NOT NULL,
    "movimientos" INTEGER NOT NULL,
    "notas" VARCHAR(500),
    "cerrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_caja_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cierres_caja_secuencia_positiva" CHECK ("secuencia" >= 1),
    CONSTRAINT "cierres_caja_movimientos_no_negativos" CHECK ("movimientos" >= 0),
    CONSTRAINT "cierres_caja_totales_lista" CHECK (jsonb_typeof("totales") = 'array')
);

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_dia_secuencia_key" ON "cierres_caja"("dia", "secuencia");

-- AddForeignKey
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un cierre es una foto del día: no se modifica ni se borra; se vuelve a cerrar.
CREATE FUNCTION "cierres_caja_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los cierres de caja no se pueden modificar ni borrar; vuelve a cerrar la caja.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "cierres_caja_sin_cambios" BEFORE UPDATE OR DELETE ON "cierres_caja"
  FOR EACH ROW EXECUTE FUNCTION "cierres_caja_inmutable"();
