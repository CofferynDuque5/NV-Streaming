-- Aditiva: Id. de transacción de PayPal que escribe el cliente (o que se lee de su captura).
ALTER TABLE "intentos_pago" ADD COLUMN "transaccion_declarada" VARCHAR(20);
