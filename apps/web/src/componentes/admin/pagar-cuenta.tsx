'use client';

import { formatearMonto } from '@nv/shared';
import { CircleDollarSign } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { useAccion } from './piezas';

/**
 * Registra el pago al proveedor con lo de siempre: el costo de la cuenta, hoy,
 * y corre el próximo cobro un ciclo. Para otro monto o fecha, la ficha de la cuenta.
 */
export function PagarCuenta({
  cuentaId,
  pista,
  costoUsd,
}: {
  cuentaId: string;
  pista: string;
  costoUsd: string;
}) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <div className="grid justify-items-end gap-1">
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando}
        onClick={() => void ejecutar('POST', `/cuentas/${cuentaId}/pagos`, {})}
        icono={<CircleDollarSign className="size-4" />}
        aria-label={`Marcar pagada ${pista} (${formatearMonto(costoUsd, 'USD')})`}
      >
        Pagado
      </Boton>
      {error && (
        <p className="text-xs text-peligro" role="alert">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}
