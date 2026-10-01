'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { claseEntrada, Mensaje, type Validacion } from '@/componentes/cliente/pago';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { erroresPorCampo, type ErrorLlamada, llamarApi } from '@/lib/api-cliente';

function validar(v: string): Validacion {
  const t = v.trim();
  if (t.length < 2) return ['mal', 'Escribe tu nombre (al menos 2 letras).'];
  if (t.length > 120) return ['mal', 'Máximo 120 caracteres.'];
  return ['ok', 'Nombre listo'];
}

/** «Tu nombre»: así lo saluda el panel. El correo no se cambia desde aquí. */
export function NombreRevendedor({ nombre, correo }: { nombre: string; correo: string }) {
  const id = useId();
  const router = useRouter();
  const notificar = useNotificar();
  const [valor, setValor] = useState(nombre);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const deApi = erroresPorCampo(error).nombre;
  const [estado, texto]: Validacion = deApi
    ? ['mal', deApi]
    : valor.trim() === nombre
      ? ['', 'Mínimo 2 letras.']
      : validar(valor);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validar(valor)[0] === 'mal') {
      notificar('Revisa el campo marcado en rojo', 'error');
      return;
    }
    setCargando(true);
    setError(null);
    const r = await llamarApi('PATCH', '/cuenta/perfil', { nombre: valor.trim() });
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      notificar(r.error.mensaje, 'error');
      return;
    }
    notificar('Guardamos tu nombre.');
    router.refresh();
  }

  return (
    <form noValidate onSubmit={guardar} className="grid gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-nombre`} className="text-sm font-semibold">
            Nombre
          </label>
          <input
            id={`${id}-nombre`}
            autoComplete="name"
            maxLength={120}
            value={valor}
            onChange={(ev) => {
              setValor(ev.target.value);
              setError(null);
            }}
            aria-invalid={estado === 'mal' ? true : undefined}
            aria-describedby={`${id}-nombre-m`}
            className={claseEntrada(estado)}
          />
          <Mensaje id={`${id}-nombre-m`} estado={estado} texto={texto} />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-correo`} className="text-sm font-semibold">
            Correo
          </label>
          <input
            id={`${id}-correo`}
            value={correo}
            readOnly
            aria-describedby={`${id}-correo-m`}
            className={claseEntrada('')}
          />
          <Mensaje id={`${id}-correo-m`} estado="" texto="Para cambiarlo escríbenos." />
        </div>
      </div>
      <Boton
        type="submit"
        cargando={cargando}
        disabled={valor.trim() === nombre}
        className="justify-self-start"
      >
        {cargando ? 'Guardando…' : 'Guardar'}
      </Boton>
    </form>
  );
}
