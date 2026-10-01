'use client';

import { requisitosContrasena } from '@nv/shared';
import clsx from 'clsx';
import { CircleCheck, KeyRound, Mail, MailCheck, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { BotonReenviar, CampoContrasena, CampoCorreo, correoValido } from './campos';
import { AvisoCarrito, vieneDelCarrito } from './formulario-ingreso';
import { EncabezadoAcceso, OrbeAcceso, PestanasAcceso, ResultadoAcceso } from './panel-acceso';

/** Envía a la API y gestiona carga, error y éxito. */
function useEnvio<T>(ruta: string) {
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState<T | null>(null);

  async function enviar(cuerpo: unknown) {
    setCargando(true);
    setError(null);
    const r = await llamarApi<T>('POST', ruta, cuerpo);
    setCargando(false);
    if (r.ok) setExito(r.datos);
    else setError(r.error);
    return r.ok;
  }
  return {
    enviar,
    error,
    cargando,
    exito,
    campos: erroresPorCampo(error),
    reiniciar: () => setExito(null),
  };
}

function ErrorGeneral({ error }: { error: ErrorLlamada | null }) {
  if (!error || error.campos) return null;
  return (
    <Alerta
      tono="peligro"
      titulo={error.codigo === 'DEMASIADOS_INTENTOS' ? 'Demasiados intentos' : undefined}
    >
      {error.mensaje}
    </Alerta>
  );
}

const ICONO_ESCUDO = (
  <OrbeAcceso color="#8b5cf6" className="size-[3.25rem] text-[1.4rem]">
    <KeyRound />
  </OrbeAcceso>
);

/* ------------------------------------------------------------------ registro */

export function FormularioRegistro({ siguiente }: { siguiente?: string | undefined }) {
  const { enviar, error, cargando, exito, campos, reiniciar } = useEnvio('/auth/registro');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [intento, setIntento] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const refCorreo = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);
  const refTerminos = useRef<HTMLInputElement>(null);
  const requisitos = requisitosContrasena(contrasena, correo);

  const nombreOk = nombre.trim().length >= 2;
  const errorNombre =
    campos.nombre ??
    (!nombre.trim()
      ? intento
        ? 'Escribe tu nombre.'
        : undefined
      : !nombreOk
        ? 'Usa al menos 2 letras.'
        : undefined);
  const ingresar = siguiente ? `/ingresar?siguiente=${encodeURIComponent(siguiente)}` : '/ingresar';

  async function registrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    const primero = !nombreOk
      ? refNombre
      : !correoValido(correo)
        ? refCorreo
        : !requisitos.every((r) => r.cumple)
          ? refContrasena
          : !acepta
            ? refTerminos
            : null;
    if (primero) {
      primero.current?.focus();
      return;
    }
    await enviar({ nombre, correo, contrasena, aceptaTerminos: acepta });
  }

  if (exito) {
    return (
      <ResultadoAcceso
        titulo="Revisa tu correo"
        color="#22d3ee"
        icono={<Mail />}
        acciones={
          <>
            <BotonReenviar
              correo={correo.trim()}
              esperarAlInicio
              className="h-11 justify-self-stretch rounded-[0.875rem] border border-borde-fuerte bg-white/[0.03] text-sm text-tinta no-underline hover:border-cian"
            />
            <button
              type="button"
              onClick={() => {
                reiniciar();
                setIntento(false);
                setCorreo('');
                setContrasena('');
              }}
              className="justify-self-center text-sm font-medium text-cian hover:underline"
            >
              Usar otro correo
            </button>
          </>
        }
      >
        <p>
          Te enviamos un correo a <b>{correo.trim()}</b> con el enlace para activar tu cuenta. Vence
          en 24 horas.
        </p>
        <ol className="grid list-decimal gap-1.5 pl-5 text-left">
          <li>Abre el correo de NV Streaming.</li>
          <li>Toca «Confirmar mi correo».</li>
          <li>
            Vuelve aquí e{' '}
            <Link href={ingresar} className="font-semibold text-cian hover:underline">
              ingresa
            </Link>
            .
          </li>
        </ol>
        <p className="text-xs text-tinta-tenue">
          ¿No llega? Revisa la carpeta de correo no deseado o promociones.
        </p>
      </ResultadoAcceso>
    );
  }

  return (
    <>
      <PestanasAcceso activa="registro" siguiente={siguiente} />
      <EncabezadoAcceso
        titulo="Crea tu cuenta"
        descripcion="Gratis. Gestiona tus servicios, pagos y soporte en un solo lugar."
      />
      <form onSubmit={registrar} className="grid gap-3.5" noValidate>
        {vieneDelCarrito(siguiente) && <AvisoCarrito />}
        <ErrorGeneral error={error} />
        <Campo
          ref={refNombre}
          etiqueta="Nombre"
          name="nombre"
          autoComplete="name"
          placeholder="Como quieres que te llamemos"
          maxLength={120}
          required
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
          valido={nombreOk}
          error={errorNombre}
        />
        <CampoCorreo
          entradaRef={refCorreo}
          valor={correo}
          alCambiar={setCorreo}
          intento={intento}
          error={campos.correo}
        />
        <CampoContrasena
          entradaRef={refContrasena}
          etiqueta="Contraseña"
          nueva
          requisitos={requisitos}
          valor={contrasena}
          alCambiar={setContrasena}
          intento={intento}
          error={campos.contrasena}
        />
        <div className="grid gap-1">
          <label
            className={clsx(
              'flex cursor-pointer items-start gap-2.5 text-[0.85rem]',
              intento && !acepta ? 'text-peligro' : 'text-tinta-suave',
            )}
          >
            <input
              ref={refTerminos}
              type="checkbox"
              name="aceptaTerminos"
              checked={acepta}
              onChange={(e) => setAcepta(e.currentTarget.checked)}
              aria-invalid={intento && !acepta ? true : undefined}
              className="mt-0.5 size-[1.1rem] shrink-0 accent-[var(--nv-marca)]"
            />
            <span>
              Acepto los{' '}
              <Link href="/terminos" className="font-medium text-cian hover:underline">
                términos
              </Link>{' '}
              y la{' '}
              <Link href="/privacidad" className="font-medium text-cian hover:underline">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          {((intento && !acepta) || campos.aceptaTerminos) && (
            <p className="text-xs font-medium text-peligro">
              {campos.aceptaTerminos ?? 'Debes aceptarlos para crear tu cuenta.'}
            </p>
          )}
        </div>
        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-0.5 w-full">
          {cargando ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
        </Boton>
      </form>
    </>
  );
}

/* ----------------------------------------------------------------- recuperar */

export function FormularioRecuperar() {
  const { enviar, error, cargando, exito, campos } = useEnvio('/auth/contrasena/recuperar');
  const [correo, setCorreo] = useState('');
  const [intento, setIntento] = useState(false);
  const refCorreo = useRef<HTMLInputElement>(null);

  async function pedir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    if (!correoValido(correo)) {
      refCorreo.current?.focus();
      return;
    }
    await enviar({ correo });
  }

  if (exito) {
    return (
      <ResultadoAcceso
        titulo="Revisa tu correo"
        color="#8b5cf6"
        icono={<Mail />}
        acciones={
          <BotonEnlace href="/ingresar" variante="secundario" className="w-full">
            Volver a ingresar
          </BotonEnlace>
        }
      >
        <p>
          Si hay una cuenta con <b>{correo.trim()}</b>, te llegará un enlace para crear tu
          contraseña nueva. Vence en 30 minutos.
        </p>
        <p className="text-xs text-tinta-tenue">
          Por seguridad no te decimos si el correo está registrado.
        </p>
      </ResultadoAcceso>
    );
  }
  return (
    <>
      <EncabezadoAcceso
        icono={ICONO_ESCUDO}
        titulo="Crea una contraseña nueva"
        descripcion="Escribe el correo de tu cuenta y te enviamos un enlace para cambiarla."
      />
      <form onSubmit={pedir} className="grid gap-3.5" noValidate>
        <ErrorGeneral error={error} />
        <CampoCorreo
          entradaRef={refCorreo}
          valor={correo}
          alCambiar={setCorreo}
          intento={intento}
          error={campos.correo}
        />
        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-0.5 w-full">
          {cargando ? 'Enviando…' : 'Enviarme el enlace'}
        </Boton>
      </form>
    </>
  );
}

/* --------------------------------------------------------------- restablecer */

export function FormularioRestablecer({ token }: { token: string }) {
  const { enviar, error, cargando, exito, campos } = useEnvio('/auth/contrasena/restablecer');
  const [contrasena, setContrasena] = useState('');
  const [intento, setIntento] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const requisitos = requisitosContrasena(contrasena);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    if (!requisitos.every((r) => r.cumple)) {
      ref.current?.focus();
      return;
    }
    if (await enviar({ token, contrasena })) setContrasena('');
  }

  if (exito) {
    return (
      <ResultadoAcceso
        titulo="Contraseña actualizada"
        color="#22c55e"
        icono={<CircleCheck />}
        acciones={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        <p>
          Ya puedes ingresar con tu contraseña nueva. Cerramos las sesiones abiertas por seguridad.
        </p>
      </ResultadoAcceso>
    );
  }
  return (
    <>
      <EncabezadoAcceso
        icono={ICONO_ESCUDO}
        titulo="Tu contraseña nueva"
        descripcion="Elige una que no uses en otros sitios."
      />
      <form onSubmit={guardar} className="grid gap-3.5" noValidate>
        <EnlaceInvalido error={error} ruta="/recuperar" />
        <CampoContrasena
          entradaRef={ref}
          etiqueta="Contraseña nueva"
          nueva
          requisitos={requisitos}
          valor={contrasena}
          alCambiar={setContrasena}
          intento={intento}
          error={campos.contrasena}
        />
        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-0.5 w-full">
          {cargando ? 'Guardando…' : 'Guardar contraseña'}
        </Boton>
      </form>
    </>
  );
}

/* ---------------------------------------------------------------- invitación */

export function FormularioInvitacion({ token }: { token: string }) {
  const { enviar, error, cargando, exito, campos } = useEnvio('/auth/invitacion/aceptar');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [intento, setIntento] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);
  const requisitos = requisitosContrasena(contrasena);
  const nombreOk = nombre.trim().length >= 2;

  async function aceptar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    if (!nombreOk) {
      refNombre.current?.focus();
      return;
    }
    if (!requisitos.every((r) => r.cumple)) {
      refContrasena.current?.focus();
      return;
    }
    await enviar({ token, nombre, contrasena });
  }

  if (exito) {
    return (
      <ResultadoAcceso
        titulo="Tu cuenta está lista"
        color="#22c55e"
        icono={<CircleCheck />}
        acciones={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        <p>Al ingresar te pediremos configurar la verificación en dos pasos.</p>
      </ResultadoAcceso>
    );
  }
  return (
    <>
      <EncabezadoAcceso
        icono={
          <OrbeAcceso color="#22d3ee" className="size-[3.25rem] text-[1.4rem]">
            <UserRoundPlus />
          </OrbeAcceso>
        }
        titulo="Acepta tu invitación"
        descripcion="Escribe tu nombre y crea la contraseña de tu cuenta del equipo."
      />
      <form onSubmit={aceptar} className="grid gap-3.5" noValidate>
        <EnlaceInvalido error={error} />
        <Campo
          ref={refNombre}
          etiqueta="Tu nombre"
          name="nombre"
          autoComplete="name"
          maxLength={120}
          required
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
          valido={nombreOk}
          error={
            campos.nombre ??
            (intento && !nombre.trim()
              ? 'Escribe tu nombre.'
              : nombre.trim() && !nombreOk
                ? 'Usa al menos 2 letras.'
                : undefined)
          }
        />
        <CampoContrasena
          entradaRef={refContrasena}
          etiqueta="Contraseña"
          nueva
          requisitos={requisitos}
          valor={contrasena}
          alCambiar={setContrasena}
          intento={intento}
          error={campos.contrasena}
        />
        <Boton type="submit" tamano="lg" cargando={cargando} className="mt-0.5 w-full">
          Activar mi cuenta
        </Boton>
      </form>
    </>
  );
}

/* ------------------------------------------------------------ confirmar correo */

/** Se confirma con un clic (y no al abrir el enlace) para que los antivirus de correo no lo gasten. */
export function ConfirmarCorreo({ token }: { token: string }) {
  const { enviar, error, cargando, exito } = useEnvio('/auth/correo/verificar');
  if (exito) {
    return (
      <ResultadoAcceso
        titulo="Correo confirmado"
        color="#22c55e"
        icono={<CircleCheck />}
        acciones={<BotonEnlace href="/ingresar">Ingresar</BotonEnlace>}
      >
        <p>Tu cuenta está activa. Ingresa para elegir tus primeros servicios.</p>
      </ResultadoAcceso>
    );
  }
  return (
    <>
      <EncabezadoAcceso
        icono={
          <OrbeAcceso color="#22d3ee" className="size-[3.25rem] text-[1.4rem]">
            <MailCheck />
          </OrbeAcceso>
        }
        titulo="Confirma tu correo"
        descripcion="Toca el botón para activar tu cuenta."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar({ token });
        }}
        className="grid gap-3.5"
      >
        <EnlaceInvalido error={error} />
        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Confirmar mi correo
        </Boton>
      </form>
    </>
  );
}

function EnlaceInvalido({ error, ruta }: { error: ErrorLlamada | null; ruta?: string }) {
  if (!error || (error.campos?.token === undefined && error.codigo !== 'ENLACE_INVALIDO'))
    return <ErrorGeneral error={error} />;
  return (
    <Alerta tono="peligro" titulo="El enlace no es válido o ya venció">
      {ruta ? (
        <Link href={ruta} className="font-semibold text-tinta underline underline-offset-3">
          Pide uno nuevo
        </Link>
      ) : (
        'Pide que te envíen uno nuevo.'
      )}
    </Alerta>
  );
}
