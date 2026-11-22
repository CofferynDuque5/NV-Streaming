-- Nuevo tipo de evento para el historial: el equipo corrigió la fecha de vencimiento.
-- Solo agrega un valor al enum: no cambia ni borra datos.
ALTER TYPE "TipoEventoSuscripcion" ADD VALUE IF NOT EXISTS 'ajuste_vencimiento';
