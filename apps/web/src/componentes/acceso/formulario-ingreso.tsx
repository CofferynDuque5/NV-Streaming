'use client';

import type { SesionActual } from '@nv/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { useCarrito } from '@/lib/carrito';
import { destinoSeguro } from '@/lib/destino';
import { BotonReenviar, CampoContrasena, CampoCorreo, correoValido } from './campos';

/** `siguiente` lleva al carrito (el de la tienda o un pedido de la cuenta). */
export function vieneDelCarrito(siguiente: string | undefined): boolean {
  return Boolean(siguiente && /^\/(carrito|cuenta\/carrito)(\/|\?|$)/.test(siguiente));
}

/** Aviso al llegar desde el carrito, con los planes que ya tiene guardados. */
export function AvisoCarrito() {
  const { planes } = useCarrito();
  const n = planes.length;
  return (
    <Alerta tono="info" titulo="Tu carrito te espera">
      Ingresa o crea tu cuenta para pagar.{' '}
      {n === 0
        ? 'Lo que elegiste se queda guardado en el carrito.'
        : n === 1
          ? 'Tu plan se queda guardado en el carrito.'
          : `Tus ${n} planes se quedan guardados en el carrito.`}
    </Alerta>
  );
}

export function FormularioIngreso({ siguiente }: { siguiente?: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  /** Correo con el que se intentó entrar (el del aviso de confirmación). */
  const [correoEnviado, setCorreoEnviado] = useState('');
  const refCorreo = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    if (!correoValido(correo)) {
      refCorreo.current?.focus();
      return;
    }
    if (!contrasena) {
      refContrasena.current?.focus();
      return;
    }
    setCargando(true);
    setError(null);
    setCorreoEnviado(correo.trim());
    const r = await llamarApi<SesionActual>('POST', '/auth/inicio-sesion', {
      correo,
      contrasena,
    });
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      if (r.error.codigo === 'CREDENCIALES_INVALIDAS') {
        setContrasena('');
        setIntento(false);
        refContrasena.current?.focus();
      }
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

  const campos = erroresPorCampo(error);
  return (
    <form onSubmit={enviar} className="grid gap-3.5" noValidate>
      {vieneDelCarrito(siguiente) && <AvisoCarrito />}
      <AlertaIngreso error={error} correo={correoEnviado} />
      <CampoCorreo
        entradaRef={refCorreo}
        valor={correo}
        alCambiar={(v) => {
          setCorreo(v);
          if (error?.codigo === 'CREDENCIALES_INVALIDAS') setError(null);
        }}
        intento={intento}
        error={campos.correo}
        autoComplete="username"
      />
      <CampoContrasena
        entradaRef={refContrasena}
        etiqueta="Contraseña"
        valor={contrasena}
        alCambiar={setContrasena}
        intento={intento}
        error={campos.contrasena}
        accesorio={
          <Link
            href="/recuperar"
            className="text-[0.8rem] font-medium whitespace-nowrap text-cian hover:underline"
          >
            ¿La olvidaste?
          </Link>
        }
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="mt-0.5 w-full">
        {cargando ? 'Ingresando…' : 'Ingresar'}
      </Boton>
    </form>
  );
}

/**
 * Errores al ingresar. El de credenciales es genérico: no dice si el correo
 * existe. El límite de intentos y el correo sin confirmar vienen de la API.
 */
function AlertaIngreso({ error, correo }: { error: ErrorLlamada | null; correo: string }) {
  if (!error || error.campos) return null;
  if (error.codigo === 'CREDENCIALES_INVALIDAS') {
    return (
      <Alerta tono="peligro" titulo="Correo o contraseña incorrectos">
        Revísalos e intenta de nuevo. Si no la recuerdas,{' '}
        <Link href="/recuperar" className="font-semibold text-tinta underline underline-offset-3">
          crea una nueva
        </Link>
        .
      </Alerta>
    );
  }
  if (error.codigo === 'DEMASIADOS_INTENTOS') {
    return (
      <Alerta tono="peligro" titulo="Demasiados intentos">
        Por tu seguridad pausamos el ingreso.{' '}
        {error.mensaje.replace(/^Demasiados intentos\.\s*/, '')}
      </Alerta>
    );
  }
  if (error.codigo === 'CORREO_NO_VERIFICADO') {
    return (
      <Alerta tono="aviso" titulo="Confirma tu correo">
        <span className="grid gap-1.5">
          <span>
            Te enviamos un enlace a <b className="break-words text-tinta">{correo}</b>. Ábrelo para
            activar tu cuenta.
          </span>
          <BotonReenviar correo={correo} className="text-tinta" />
        </span>
      </Alerta>
    );
  }
  return <Alerta tono="peligro">{error.mensaje}</Alerta>;
}
