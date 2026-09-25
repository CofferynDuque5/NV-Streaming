'use client';

import type { SesionActual } from '@nv/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { destinoSeguro } from '@/lib/destino';

export function FormularioIngreso({ siguiente }: { siguiente?: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [reenviado, setReenviado] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const datos = new FormData(e.currentTarget);
    const r = await llamarApi<SesionActual>('POST', '/auth/inicio-sesion', {
      correo: datos.get('correo'),
      contrasena: datos.get('contrasena'),
    });
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      return;
    }
    const { pendiente, usuario } = r.datos;
    const destino = destinoSeguro(siguiente, usuario.rol);
    const conDestino = (ruta: string) =>
      destino === siguiente ? `${ruta}?siguiente=${encodeURIComponent(destino)}` : ruta;
    if (pendiente === 'configurar_2fa') router.push(conDestino('/configurar-2fa'));
    else if (pendiente === 'verificar_2fa') router.push(conDestino('/verificacion-2fa'));
    else router.push(destino);
    router.refresh();
  }

  async function reenviar() {
    await llamarApi('POST', '/auth/correo/reenviar', { correo });
    setReenviado(true);
  }

  const campos = erroresPorCampo(error);
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      {error && !error.campos && error.codigo !== 'CORREO_NO_VERIFICADO' && (
        <Alerta tono="peligro">{error.mensaje}</Alerta>
      )}
      {error?.codigo === 'CORREO_NO_VERIFICADO' && (
        <Alerta tono="aviso" titulo="Confirma tu correo">
          {reenviado ? (
            'Te enviamos un enlace nuevo. Revisa tu bandeja de entrada y el correo no deseado.'
          ) : (
            <>
              {error.mensaje}{' '}
              <button
                type="button"
                onClick={reenviar}
                className="font-medium text-marca underline underline-offset-2"
              >
                Reenviar enlace
              </button>
            </>
          )}
        </Alerta>
      )}
      <Campo
        etiqueta="Correo"
        name="correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        error={campos.correo}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="current-password"
        required
        error={campos.contrasena}
        accesorio={
          <Link href="/recuperar" className="text-xs font-medium text-marca hover:underline">
            ¿La olvidaste?
          </Link>
        }
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="mt-1 w-full">
        Ingresar
      </Boton>
    </form>
  );
}
