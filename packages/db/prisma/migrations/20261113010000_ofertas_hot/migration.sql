-- Ofertas HOT: descuento en porcentaje por plan con fecha de fin.
ALTER TABLE "planes" ADD COLUMN "oferta_porcentaje" INTEGER,
ADD COLUMN "oferta_hasta" TIMESTAMPTZ(3);

ALTER TABLE "planes" ADD CONSTRAINT "planes_oferta_valida" CHECK (
  ("oferta_porcentaje" IS NULL AND "oferta_hasta" IS NULL)
  OR ("oferta_porcentaje" BETWEEN 1 AND 90 AND "oferta_hasta" IS NOT NULL)
);

CREATE INDEX "planes_oferta_hasta_idx" ON "planes" ("oferta_hasta") WHERE "oferta_hasta" IS NOT NULL;

-- Parte del descuento de la factura que viene de la oferta, en USD.
ALTER TABLE "facturas" ADD COLUMN "descuento_oferta_usd" DECIMAL(14,2);
