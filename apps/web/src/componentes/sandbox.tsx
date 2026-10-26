'use client';

import { Check, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';

type Resultado = 'aprobar' | 'rechazar' | 'cancelar';

/** Botones de la pasarela de pruebas: simulan la respuesta y devuelven al cliente al sitio. */
export function SimularPago({ intentoId }: { intentoId: string }) {
  const [cargando, setCargando] = useState<Resultado | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function simular(resultado: Resultado) {
    setCargando(resultado);
    setError(null);
    const r = await llamarApi<{ urlRetorno: string }>(
      'POST',
      `/pasarelas/sandbox/intentos/${intentoId}/simular`,
      { resultado },
    );
    if (!r.ok) {
      setCargando(null);
      return setError(r.error);
    }
    window.location.assign(r.datos.urlRetorno);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">¿Qué respuesta quieres simular?</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Boton
          tamano="lg"
          cargando={cargando === 'aprobar'}
          disabled={cargando !== null}
          icono={<Check className="size-4" aria-hidden="true" />}
          onClick={() => void simular('aprobar')}
        >
          Aprobar
        </Boton>
        <Boton
          tamano="lg"
          variante="peligro"
          cargando={cargando === 'rechazar'}
          disabled={cargando !== null}
          icono={<X className="size-4" aria-hidden="true" />}
          onClick={() => void simular('rechazar')}
        >
          Rechazar
        </Boton>
        <Boton
          tamano="lg"
          variante="secundario"
          cargando={cargando === 'cancelar'}
          disabled={cargando !== null}
          icono={<Undo2 className="size-4" aria-hidden="true" />}
          onClick={() => void simular('cancelar')}
        >
          Cancelar
        </Boton>
      </div>
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </div>
  );
}
