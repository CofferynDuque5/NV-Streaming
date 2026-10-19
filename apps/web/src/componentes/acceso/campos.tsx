'use client';

import type { RequisitoContrasena } from '@nv/shared';
import clsx from 'clsx';
import { Check, Eye, EyeOff, TriangleAlert } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from 'react';
import { Campo, clasesEntrada } from '@/componentes/ui/campo';
import { llamarApi } from '@/lib/api-cliente';
import { useNotificar } from '@/componentes/ui/notificaciones';

/** Formato de correo para la validación en vivo (la API lo vuelve a validar). */
export function correoValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(valor.trim());
}

/**
 * Correo con validación en vivo: marca en verde cuando el formato es correcto y
 * muestra el error al salir del campo o al intentar enviar.
 */
export function CampoCorreo({
  valor,
  alCambiar,
  intento,
  error,
  autoComplete = 'email',
  entradaRef,
}: {
  valor: string;
  alCambiar: (valor: string) => void;
  intento: boolean;
  error?: string | undefined;
  autoComplete?: string;
  entradaRef?: RefObject<HTMLInputElement | null>;
}) {
  const [tocado, setTocado] = useState(false);
  const ok = correoValido(valor);
  const errorLocal = !valor.trim()
    ? intento
      ? 'Escribe tu correo.'
      : undefined
    : !ok && (intento || tocado)
      ? 'Revisa el correo, por ejemplo tu@correo.com'
      : undefined;
  return (
    <Campo
      ref={entradaRef}
      etiqueta="Correo"
      name="correo"
      type="email"
      inputMode="email"
      autoComplete={autoComplete}
      placeholder="tu@correo.com"
      maxLength={254}
      required
      value={valor}
      onChange={(e) => alCambiar(e.currentTarget.value)}
      onBlur={() => setTocado(true)}
      valido={ok}
      error={error ?? errorLocal}
    />
  );
}

/** Cuántos segmentos de la barra de fuerza se encienden (de 0 a 4). */
function segmentos(requisitos: RequisitoContrasena[], valor: string): number {
  if (!valor) return 0;
  const cumplidos = requisitos.filter((r) => r.cumple).length;
  return Math.max(1, Math.round((cumplidos / requisitos.length) * 4));
}

const COLOR_FUERZA = ['', 'bg-peligro', 'bg-aviso', 'bg-[#a3e635]', 'bg-exito'];
const NOMBRE_FUERZA = ['', 'débil', 'regular', 'buena', 'lista'];

/**
 * Contraseña con botón para mostrarla, aviso de mayúsculas activadas y, si es
 * nueva, la lista de requisitos y la barra de fuerza marcadas en vivo.
 */
export function CampoContrasena({
  etiqueta,
  valor,
  alCambiar,
  nueva = false,
  requisitos,
  intento,
  error,
  accesorio,
  name = 'contrasena',
  entradaRef,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  nueva?: boolean;
  /** Requisitos de `requisitosContrasena` (solo para una contraseña nueva). */
  requisitos?: RequisitoContrasena[];
  intento: boolean;
  error?: string | undefined;
  accesorio?: ReactNode;
  name?: string;
  entradaRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const cumple = requisitos ? valor.length > 0 && requisitos.every((r) => r.cumple) : false;
  const errorLocal = !valor
    ? intento
      ? 'Escribe tu contraseña.'
      : undefined
    : requisitos && intento && !cumple
      ? 'La contraseña aún no cumple los requisitos.'
      : undefined;
  const mensaje = error ?? errorLocal;
  const n = requisitos ? segmentos(requisitos, valor) : 0;

  function revisarMayusculas(e: KeyboardEvent<HTMLInputElement>) {
    setMayusculas(e.getModifierState?.('CapsLock') ?? false);
  }

  const describe = [
    mayusculas ? `${id}-mayus` : null,
    requisitos ? `${id}-requisitos` : null,
    mensaje ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-tinta">
          {etiqueta}
        </label>
        {accesorio}
      </div>
      <div className="relative">
        <input
          ref={entradaRef}
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={nueva ? 'new-password' : 'current-password'}
          maxLength={128}
          required
          value={valor}
          onChange={(e) => alCambiar(e.currentTarget.value)}
          onKeyDown={revisarMayusculas}
          onKeyUp={revisarMayusculas}
          onBlur={() => setMayusculas(false)}
          aria-invalid={mensaje ? true : undefined}
          aria-describedby={describe || undefined}
          data-valido={cumple && !mensaje ? true : undefined}
          className={clsx(clasesEntrada, 'pr-12')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0.5 my-auto grid size-10 place-items-center rounded-[0.65rem] text-tinta-tenue hover:text-tinta aria-pressed:text-cian"
        >
          {visible ? (
            <EyeOff className="size-[1.1rem]" aria-hidden="true" />
          ) : (
            <Eye className="size-[1.1rem]" aria-hidden="true" />
          )}
        </button>
      </div>
      {mayusculas && (
        <p id={`${id}-mayus`} className="flex items-center gap-1.5 text-xs text-aviso">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          Tienes activadas las mayúsculas
        </p>
      )}
      {requisitos && (
        <>
          <div className="mt-1 grid grid-cols-4 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={clsx(
                  'h-1 rounded-full transition-colors',
                  i <= n ? COLOR_FUERZA[n] : 'bg-borde-fuerte',
                )}
              />
            ))}
          </div>
          <ListaRequisitos
            id={`${id}-requisitos`}
            requisitos={requisitos}
            intento={intento}
            fuerza={NOMBRE_FUERZA[n] ?? ''}
          />
        </>
      )}
      {mensaje && (
        <p id={`${id}-error`} className="text-xs font-medium text-peligro">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function ListaRequisitos({
  id,
  requisitos,
  intento,
  fuerza,
}: {
  id: string;
  requisitos: RequisitoContrasena[];
  intento: boolean;
  fuerza: string;
}) {
  return (
    <div id={id}>
      <p className="sr-only" aria-live="polite">
        {fuerza ? `Contraseña ${fuerza}.` : ''}
      </p>
      <ul className="grid gap-1 text-[0.8rem]" aria-label="Requisitos de la contraseña">
        {requisitos.map((r) => (
          <li
            key={r.clave}
            className={clsx(
              'flex items-center gap-2 transition-colors',
              r.cumple ? 'text-exito' : intento ? 'text-peligro' : 'text-tinta-tenue',
            )}
          >
            <span
              className={clsx(
                'grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]',
                r.cumple
                  ? 'border-exito bg-exito text-fondo'
                  : intento
                    ? 'border-peligro'
                    : 'border-borde-fuerte',
              )}
              aria-hidden="true"
            >
              {r.cumple && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span>
              {r.texto}
              <span className="sr-only">{r.cumple ? ': cumple' : ': falta'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ESPERA_REENVIO_S = 60;

/**
 * Reenvía el correo de confirmación (POST /auth/correo/reenviar) y espera 60 s
 * antes de dejar pedirlo otra vez. La API responde igual exista o no la cuenta.
 */
export function BotonReenviar({
  correo,
  esperarAlInicio = false,
  className,
}: {
  correo: string;
  /** Recién se envió un correo (por ejemplo, al registrarse): empieza esperando. */
  esperarAlInicio?: boolean;
  className?: string;
}) {
  const notificar = useNotificar();
  const [restante, setRestante] = useState(esperarAlInicio ? ESPERA_REENVIO_S : 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);

  async function reenviar() {
    setEnviando(true);
    setError(null);
    const r = await llamarApi('POST', '/auth/correo/reenviar', { correo });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setRestante(ESPERA_REENVIO_S);
    notificar('Te enviamos el correo de nuevo. Revisa también el correo no deseado.', 'exito');
  }

  return (
    <span className="grid gap-1">
      <button
        type="button"
        onClick={reenviar}
        disabled={restante > 0 || enviando}
        className={clsx(
          'justify-self-start font-semibold underline underline-offset-3 disabled:cursor-default disabled:no-underline disabled:opacity-70',
          className,
        )}
      >
        {enviando
          ? 'Enviando…'
          : restante > 0
            ? `Puedes reenviarlo en ${restante} s`
            : 'Reenviar el correo'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-peligro">
          {error}
        </span>
      )}
    </span>
  );
}
