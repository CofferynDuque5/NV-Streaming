'use client';

import type { LicenciaPublica } from '@nv/shared';
import { KeyRound } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { ErrorGeneral, useAccion } from './piezas';

/** Pegar la licencia nueva o la renovación que envía quien vende el sistema. */
export function CargarLicencia() {
  const id = useId();
  const notificar = useNotificar();
  const { cargando, error, campos, ejecutar } = useAccion();
  const [licencia, setLicencia] = useState('');

  async function cargar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await ejecutar<LicenciaPublica>('PUT', '/licencia', { licencia });
    if (r) {
      setLicencia('');
      notificar('Licencia cargada');
    }
  }

  return (
    <form onSubmit={cargar} className="grid gap-3 px-5 py-4 sm:px-6">
      <label htmlFor={id} className="text-sm font-semibold text-tinta">
        Licencia nueva o renovación
      </label>
      <textarea
        id={id}
        value={licencia}
        onChange={(e) => setLicencia(e.target.value)}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        placeholder="NVL1.…"
        aria-invalid={campos['licencia'] ? true : undefined}
        aria-describedby={campos['licencia'] ? `${id}-error` : undefined}
        className={`${clasesEntrada} h-auto min-h-24 py-3 font-mono text-xs break-all`}
      />
      {campos['licencia'] && (
        <p id={`${id}-error`} className="text-sm text-peligro">
          {campos['licencia']}
        </p>
      )}
      <ErrorGeneral error={error} />
      <div>
        <Boton type="submit" disabled={cargando || licencia.trim().length < 10}>
          <KeyRound className="size-4" aria-hidden="true" />
          {cargando ? 'Comprobando…' : 'Cargar licencia'}
        </Boton>
      </div>
    </form>
  );
}
