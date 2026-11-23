'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { CampoContrasenaNueva } from '@/componentes/ui/lista-contrasena';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

/**
 * Para el revendedor que no logra entrar solo: administración le pone una clave
 * o le confirma el correo. La clave viaja una sola vez a la API (que guarda solo
 * su hash) y el formulario se vacía al terminar.
 */
export function CuentaAccesoRevendedor({
  usuarioId,
  correoVerificado,
  tieneClave,
}: {
  usuarioId: string;
  correoVerificado: boolean;
  tieneClave: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<'clave' | 'correo' | null>(null);
  const [error, setError] = useState<{ accion: string; error: ErrorLlamada } | null>(null);
  const [aviso, setAviso] = useState<{ accion: string; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  async function ponerClave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const contrasena = new FormData(formulario).get('contrasena');
    setOcupado('clave');
    setError(null);
    setAviso(null);
    const r = await llamarApi('POST', `/usuarios/${usuarioId}/contrasena`, { contrasena });
    setOcupado(null);
    if (!r.ok) return setError({ accion: 'clave', error: r.error });
    formulario.reset();
    setVuelta((v) => v + 1);
    setAviso({
      accion: 'clave',
      texto:
        'Clave guardada y correo confirmado. Pásasela por privado y pídele que la cambie en Ajustes al entrar.',
    });
    router.refresh();
  }

  async function verificarCorreo() {
    setOcupado('correo');
    setError(null);
    setAviso(null);
    const r = await llamarApi('POST', `/usuarios/${usuarioId}/verificar-correo`, {});
    setOcupado(null);
    if (!r.ok) return setError({ accion: 'correo', error: r.error });
    setAviso({ accion: 'correo', texto: 'Correo confirmado. Ya puede entrar con su clave.' });
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

  return (
    <div className="grid gap-5 px-5 py-5 text-sm sm:px-6">
      <div className="flex flex-wrap gap-2">
        <Insignia tono={correoVerificado ? 'exito' : 'aviso'}>
          {correoVerificado ? 'Correo confirmado' : 'Correo sin confirmar'}
        </Insignia>
        <Insignia tono={tieneClave ? 'exito' : 'aviso'}>
          {tieneClave ? 'Tiene clave' : 'Sin clave'}
        </Insignia>
      </div>

      {!correoVerificado && (
        <div className="grid gap-2">
          <p className="text-tinta-suave">
            Si no le llega o no puede abrir el enlace de confirmación, confírmalo tú.
          </p>
          <Boton
            variante="secundario"
            className="justify-self-start"
            cargando={ocupado === 'correo'}
            onClick={() => void verificarCorreo()}
          >
            Confirmar correo
          </Boton>
          {mensajes('correo')}
        </div>
      )}

      <form key={vuelta} onSubmit={ponerClave} className="grid gap-3" noValidate>
        <p className="text-tinta-suave">
          {tieneClave
            ? 'Ponle una clave nueva si olvidó la suya. Se cierran sus sesiones y le avisamos por correo (sin la clave).'
            : 'Ponle una clave para que pueda entrar. También queda confirmado su correo.'}
        </p>
        <CampoContrasenaNueva
          etiqueta={tieneClave ? 'Clave nueva' : 'Clave'}
          error={error?.accion === 'clave' ? erroresPorCampo(error.error).contrasena : undefined}
        />
        <Boton
          type="submit"
          variante="secundario"
          className="justify-self-start"
          cargando={ocupado === 'clave'}
        >
          Guardar clave
        </Boton>
        {mensajes('clave')}
      </form>
    </div>
  );
}
