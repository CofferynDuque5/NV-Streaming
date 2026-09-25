'use client';

import { LONGITUD_MINIMA_CONTRASENA } from '@nv/shared';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

const AYUDA_CONTRASENA = `Al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres. Una frase fácil de recordar funciona muy bien.`;

/** Envía un formulario a la API y gestiona carga, errores y éxito. */
function useEnvio<T>(ruta: string, preparar: (datos: FormData) => unknown) {
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState<T | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const r = await llamarApi<T>('POST', ruta, preparar(new FormData(e.currentTarget)));
    setCargando(false);
    if (r.ok) setExito(r.datos);
    else setError(r.error);
  }
  return { enviar, error, cargando, exito, campos: erroresPorCampo(error) };
}

function ErrorGeneral({ error }: { error: ErrorLlamada | null }) {
  if (!error || error.campos) return null;
  return <Alerta tono="peligro">{error.mensaje}</Alerta>;
}

function Confirmacion({
  titulo,
  children,
  accion,
}: {
  titulo: string;
  children: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-4 py-2 text-center" role="status">
      <span className="grid size-12 place-items-center rounded-2xl bg-exito-suave text-exito">
        <MailCheck className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="text-sm text-tinta-suave">{children}</p>
      {accion}
    </div>
  );
}

export function FormularioRegistro() {
  const { enviar, error, cargando, exito, campos } = useEnvio('/auth/registro', (d) => ({
    nombre: d.get('nombre'),
    correo: d.get('correo'),
    contrasena: d.get('contrasena'),
    aceptaTerminos: d.get('aceptaTerminos') === 'on',
  }));
  if (exito) {
    return (
      <Confirmacion titulo="Revisa tu correo">
        Si el correo es correcto, te llegará un enlace para confirmar tu cuenta. Vence en 24 horas.
      </Confirmacion>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <ErrorGeneral error={error} />
      <Campo etiqueta="Nombre" name="nombre" autoComplete="name" required error={campos.nombre} />
      <Campo
        etiqueta="Correo"
        name="correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={campos.correo}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        error={campos.contrasena}
        ayuda={AYUDA_CONTRASENA}
      />
      <div className="grid gap-1.5">
        <label className="flex items-start gap-3 text-sm text-tinta-suave">
          <input
            type="checkbox"
            name="aceptaTerminos"
            required
            className="mt-0.5 size-4 accent-[var(--nv-marca)]"
          />
          <span>
            Acepto los{' '}
            <Link href="/terminos" className="font-medium text-marca hover:underline">
              términos
            </Link>{' '}
            y la{' '}
            <Link href="/privacidad" className="font-medium text-marca hover:underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {campos.aceptaTerminos && (
          <p className="text-xs font-medium text-peligro">{campos.aceptaTerminos}</p>
        )}
      </div>
      <Boton type="submit" tamano="lg" cargando={cargando} className="mt-1 w-full">
        Crear cuenta
      </Boton>
    </form>
  );
}

export function FormularioRecuperar() {
  const { enviar, error, cargando, exito, campos } = useEnvio(
    '/auth/contrasena/recuperar',
    (d) => ({ correo: d.get('correo') }),
  );
  if (exito) {
    return (
      <Confirmacion
        titulo="Revisa tu correo"
        accion={
          <BotonEnlace href="/ingresar" variante="secundario">
            Volver a ingresar
          </BotonEnlace>
        }
      >
        Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva.
        Vence en 30 minutos.
      </Confirmacion>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <ErrorGeneral error={error} />
      <Campo
        etiqueta="Correo"
        name="correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={campos.correo}
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Enviar enlace
      </Boton>
    </form>
  );
}

export function FormularioRestablecer({ token }: { token: string }) {
  const { enviar, error, cargando, exito, campos } = useEnvio(
    '/auth/contrasena/restablecer',
    (d) => ({ token, contrasena: d.get('contrasena') }),
  );
  if (exito) {
    return (
      <Confirmacion
        titulo="Contraseña actualizada"
        accion={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        Cerramos las sesiones abiertas por seguridad. Ya puedes ingresar con tu contraseña nueva.
      </Confirmacion>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <EnlaceInvalido error={error} ruta="/recuperar" />
      <Campo
        etiqueta="Contraseña nueva"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        error={campos.contrasena}
        ayuda={AYUDA_CONTRASENA}
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Guardar contraseña
      </Boton>
    </form>
  );
}

export function FormularioInvitacion({ token }: { token: string }) {
  const { enviar, error, cargando, exito, campos } = useEnvio('/auth/invitacion/aceptar', (d) => ({
    token,
    nombre: d.get('nombre'),
    contrasena: d.get('contrasena'),
  }));
  if (exito) {
    return (
      <Confirmacion
        titulo="Tu cuenta está lista"
        accion={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        Al ingresar te pediremos configurar la verificación en dos pasos.
      </Confirmacion>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <EnlaceInvalido error={error} />
      <Campo
        etiqueta="Tu nombre"
        name="nombre"
        autoComplete="name"
        required
        error={campos.nombre}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        error={campos.contrasena}
        ayuda={AYUDA_CONTRASENA}
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Activar mi cuenta
      </Boton>
    </form>
  );
}

/** Se confirma con un clic (y no al abrir el enlace) para que los antivirus de correo no lo gasten. */
export function ConfirmarCorreo({ token }: { token: string }) {
  const { enviar, error, cargando, exito } = useEnvio('/auth/correo/verificar', () => ({ token }));
  if (exito) {
    return (
      <Confirmacion
        titulo="Correo confirmado"
        accion={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        Tu cuenta ya está activa.
      </Confirmacion>
    );
  }
  return (
    <form onSubmit={enviar} className="grid gap-4">
      <EnlaceInvalido error={error} />
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Confirmar mi correo
      </Boton>
    </form>
  );
}

function EnlaceInvalido({ error, ruta }: { error: ErrorLlamada | null; ruta?: string }) {
  if (!error || (error.campos?.token === undefined && error.codigo !== 'ENLACE_INVALIDO'))
    return <ErrorGeneral error={error} />;
  return (
    <Alerta tono="peligro" titulo="El enlace no es válido o ya venció">
      {ruta ? (
        <Link href={ruta} className="font-medium text-marca hover:underline">
          Solicita uno nuevo
        </Link>
      ) : (
        'Pide que te envíen uno nuevo.'
      )}
    </Alerta>
  );
}
