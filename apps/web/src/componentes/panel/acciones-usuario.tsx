'use client';

import type { EstadoUsuario, Rol } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { SelectorRol } from './equipo';

interface Props {
  id: string;
  rol: Rol;
  estado: EstadoUsuario;
  dosPasosActivo: boolean;
  invitacionPendiente: boolean;
}

function Accion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_minmax(0,22rem)] sm:gap-8 sm:px-6">
      <div className="grid content-start gap-1">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-sm text-tinta-suave">{descripcion}</p>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

/** Acciones de administración sobre otra persona. Cada una queda en la auditoría. */
export function AccionesUsuario({ id, rol, estado, dosPasosActivo, invitacionPendiente }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<{ accion: string; error: ErrorLlamada } | null>(null);
  const [aviso, setAviso] = useState<{ accion: string; texto: string } | null>(null);

  async function ejecutar(
    accion: string,
    metodo: 'POST' | 'PATCH',
    ruta: string,
    cuerpo: unknown,
    exito: string,
  ) {
    setOcupado(accion);
    setError(null);
    setAviso(null);
    const r = await llamarApi(metodo, ruta, cuerpo);
    setOcupado(null);
    if (!r.ok) return setError({ accion, error: r.error });
    setAviso({ accion, texto: exito });
    router.refresh();
  }

  const mensajes = (accion: string) => (
    <>
      {error?.accion === accion && !error.error.campos && (
        <Alerta tono="peligro">{error.error.mensaje}</Alerta>
      )}
      {aviso?.accion === accion && <Alerta tono="exito">{aviso.texto}</Alerta>}
    </>
  );

  const cambiarRol = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nuevo = new FormData(e.currentTarget).get('rol');
    void ejecutar(
      'rol',
      'PATCH',
      `/usuarios/${id}/rol`,
      { rol: nuevo },
      'Rol actualizado. La persona deberá volver a iniciar sesión.',
    );
  };

  const cambiarEstado = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = new FormData(e.currentTarget).get('motivo');
    const nuevo = estado === 'activo' ? 'suspendido' : 'activo';
    void ejecutar(
      'estado',
      'PATCH',
      `/usuarios/${id}/estado`,
      { estado: nuevo, motivo },
      nuevo === 'activo' ? 'Cuenta reactivada.' : 'Cuenta suspendida y sesiones cerradas.',
    );
  };

  return (
    <div className="divide-y divide-borde">
      <Accion
        titulo="Rol"
        descripcion="Define qué puede hacer. Al cambiarlo se cierran sus sesiones."
      >
        <form onSubmit={cambiarRol} className="flex gap-2">
          <label htmlFor="nuevo-rol" className="sr-only">
            Rol
          </label>
          <SelectorRol id="nuevo-rol" name="rol" defaultValue={rol} />
          <Boton type="submit" variante="secundario" cargando={ocupado === 'rol'}>
            Guardar
          </Boton>
        </form>
        {mensajes('rol')}
      </Accion>

      <Accion
        titulo={estado === 'activo' ? 'Suspender cuenta' : 'Reactivar cuenta'}
        descripcion={
          estado === 'activo'
            ? 'Impide el acceso y cierra sus sesiones. El motivo queda en la auditoría.'
            : 'Devuelve el acceso a la cuenta.'
        }
      >
        <form onSubmit={cambiarEstado} className="grid gap-2" noValidate>
          <Campo
            etiqueta="Motivo"
            name="motivo"
            required
            error={error?.accion === 'estado' ? erroresPorCampo(error.error).motivo : undefined}
          />
          <Boton
            type="submit"
            variante={estado === 'activo' ? 'peligro' : 'secundario'}
            cargando={ocupado === 'estado'}
            className="justify-self-start"
          >
            {estado === 'activo' ? 'Suspender' : 'Reactivar'}
          </Boton>
        </form>
        {mensajes('estado')}
      </Accion>

      {dosPasosActivo && (
        <Accion
          titulo="Restablecer verificación en dos pasos"
          descripcion="Para quien perdió su teléfono y sus códigos. La configurará de nuevo al entrar."
        >
          <Boton
            variante="secundario"
            className="justify-self-start"
            cargando={ocupado === '2fa'}
            onClick={() => {
              if (
                window.confirm(
                  '¿Restablecer la verificación en dos pasos de esta persona? Se cerrarán sus sesiones.',
                )
              ) {
                void ejecutar(
                  '2fa',
                  'POST',
                  `/usuarios/${id}/2fa/restablecer`,
                  {},
                  'Verificación restablecida. Le avisamos por correo.',
                );
              }
            }}
          >
            Restablecer
          </Boton>
          {mensajes('2fa')}
        </Accion>
      )}

      {invitacionPendiente && (
        <Accion
          titulo="Invitación pendiente"
          descripcion="Aún no ha creado su contraseña. Puedes enviarle un enlace nuevo."
        >
          <Boton
            variante="secundario"
            className="justify-self-start"
            cargando={ocupado === 'invitacion'}
            onClick={() =>
              void ejecutar(
                'invitacion',
                'POST',
                `/usuarios/${id}/invitacion/reenviar`,
                {},
                'Invitación reenviada.',
              )
            }
          >
            Reenviar invitación
          </Boton>
          {mensajes('invitacion')}
        </Accion>
      )}
    </div>
  );
}
