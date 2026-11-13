'use client';

import { ClipboardCheck } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { useAccion } from './piezas';

/** Pasa una cuenta sin anotar al inventario (queda activa y se puede asignar). */
export function AnotarCuenta({ cuentaId, pista }: { cuentaId: string; pista: string }) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <div className="grid justify-items-end gap-1">
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando}
        onClick={() => void ejecutar('PATCH', `/cuentas/${cuentaId}`, { estado: 'activa' })}
        icono={<ClipboardCheck className="size-4" />}
        aria-label={`Anotar ${pista} en el inventario`}
      >
        Anotar en inventario
      </Boton>
      {error && (
        <p className="text-xs text-peligro" role="alert">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}
