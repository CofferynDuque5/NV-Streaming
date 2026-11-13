'use client';

import { Target } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorGeneral, useAccion } from '@/componentes/admin/piezas';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';

/** Fija o quita la meta de ingresos del mes (USD). */
export function EditarMeta({ actual }: { actual: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = String(new FormData(e.currentTarget).get('montoUsd') ?? '').trim();
    const r = await ejecutar('PUT', '/metricas/meta', { montoUsd: valor || null });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        onClick={() => setAbierto(true)}
        icono={<Target className="size-3.5" />}
      >
        {actual ? 'Cambiar meta' : 'Fijar meta'}
      </Boton>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-2" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <Campo
          etiqueta="Meta del mes (USD)"
          name="montoUsd"
          inputMode="decimal"
          defaultValue={actual ?? ''}
          placeholder="500.00"
          ayuda="Vacío la quita."
          error={campos.montoUsd}
          className="w-40"
        />
        <Boton type="submit" tamano="sm" cargando={cargando}>
          Guardar
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
      <ErrorGeneral error={error} />
    </form>
  );
}
