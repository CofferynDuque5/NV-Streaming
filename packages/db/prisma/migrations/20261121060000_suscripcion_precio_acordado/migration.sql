-- Precio acordado por periodo (USD). Solo agrega una columna vacía: no cambia datos.
ALTER TABLE "suscripciones" ADD COLUMN "precio_usd" DECIMAL(14,2);
