'use client';

import { Lock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/**
 * «Cerrar caja»: guarda la foto del día hasta este momento. Si ya hay un
 * cierre, solo aparece cuando entró dinero después de él.
 */
export function CerrarCaja({ dia, nuevoCierre }: { dia: string; nuevoCierre: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', '/caja/cierres', { dia, notas: textoDe(d, 'notas') });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Lock className="size-4" />}>
        {nuevoCierre ? 'Cerrar de nuevo' : 'Cerrar caja'}
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo={nuevoCierre ? 'Cerrar la caja de nuevo' : 'Cerrar la caja'}
      descripcion="El cierre guarda los totales de este momento y no se puede editar. Si entra dinero después, podrás cerrar otra vez."
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <Campo
          etiqueta="Notas (opcional)"
          name="notas"
          maxLength={500}
          placeholder="Cuadró con el banco"
          error={campos.notas}
        />
        <ErrorGeneral error={error} />
        <div>
          <Boton type="submit" cargando={cargando} icono={<Lock className="size-4" />}>
            Guardar cierre
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}
