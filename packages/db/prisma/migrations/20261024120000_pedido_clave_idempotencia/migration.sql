-- Clave de idempotencia del pedido del carrito: repetir la petición (doble
-- clic o reintento tras un corte de red) devuelve el mismo pedido en lugar de
-- crear y cobrar otro. Los pedidos anteriores quedan con NULL (PostgreSQL
-- trata los NULL como distintos en el índice único).
-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "clave_idempotencia" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_cliente_id_clave_idempotencia_key" ON "pedidos"("cliente_id", "clave_idempotencia");
