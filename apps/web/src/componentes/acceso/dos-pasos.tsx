'use client';

import type { SesionActual } from '@nv/shared';
import clsx from 'clsx';
import { Check, Copy, Download, QrCode, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

interface Inicio {
  secreto: string;
  uri: string;
  qr: string;
}

/**
 * Activa la verificación en dos pasos: genera el QR, confirma un código y
 * muestra los códigos de respaldo una sola vez.
 */
export function ConfiguradorDosPasos({ destino }: { destino?: string }) {
  const router = useRouter();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);

  async function generar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<Inicio>('POST', '/cuenta/2fa/iniciar');
    setCargando(false);
    if (r.ok) setInicio(r.datos);
    else setError(r.error);
  }

  const [digitos, setDigitos] = useState(VACIO);
  const [version, setVersion] = useState(0);

  async function confirmar(codigo: string) {
    if (cargando) return;
    if (!/^\d{6}$/.test(codigo)) {
      setError({ estado: 0, codigo: 'LOCAL', mensaje: 'Escribe los 6 dígitos del código.' });
      return;
    }
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ codigosRespaldo: string[]; sesion: SesionActual }>(
      'POST',
      '/cuenta/2fa/confirmar',
      { codigo },
    );
    setCargando(false);
    if (r.ok) setCodigos(r.datos.codigosRespaldo);
    else {
      setError(r.error);
      setDigitos(VACIO);
      setVersion((v) => v + 1);
    }
  }

  if (codigos) {
    return (
      <CodigosRespaldo
        codigos={codigos}
        alContinuar={() => {
          if (destino) router.push(destino);
          router.refresh();
        }}
      />
    );
  }

  if (!inicio) {
    return (
      <div className="grid gap-4">
        {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        <ol className="grid gap-3 text-sm text-tinta-suave">
          <li className="flex gap-3">
            <Paso n={1} /> Instala una aplicación de autenticación gratuita, como Google
            Authenticator, Microsoft Authenticator, Aegis o 2FAS.
          </li>
          <li className="flex gap-3">
            <Paso n={2} /> Escanea el código QR que generaremos.
          </li>
          <li className="flex gap-3">
            <Paso n={3} /> Escribe el código de 6 dígitos que muestra la aplicación.
          </li>
        </ol>
        <Boton
          tamano="lg"
          onClick={generar}
          cargando={cargando}
          icono={<QrCode className="size-4" />}
          className="w-full"
        >
          Generar código QR
        </Boton>
      </div>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void confirmar(digitos.join(''));
      }}
      className="grid gap-5"
      noValidate
    >
      <div className="grid justify-items-center gap-3">
        {/* El SVG lo genera nuestra API; como imagen no puede ejecutar código. */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(inicio.qr)}`}
          alt="Código QR para tu aplicación de autenticación"
          width={200}
          height={200}
          className="rounded-xl bg-white p-2"
        />
        <details className="w-full text-center text-sm text-tinta-suave">
          <summary className="cursor-pointer">¿No puedes escanearlo? Escribe la clave</summary>
          <code className="mt-2 block rounded-lg bg-hundida px-3 py-2 font-mono text-sm tracking-wider break-all text-tinta">
            {inicio.secreto.match(/.{1,4}/g)?.join(' ')}
          </code>
        </details>
      </div>
      {error && !error.campos && (
        <Alerta
          tono="peligro"
          titulo={error.codigo === 'CODIGO_INCORRECTO' ? 'Código incorrecto' : undefined}
        >
          {error.mensaje}
        </Alerta>
      )}
      <CodigoOtp
        key={version}
        digitos={digitos}
        alCambiar={setDigitos}
        alCompletar={confirmar}
        invalido={Boolean(error)}
        error={campos.codigo}
      />
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Activar verificación
      </Boton>
    </form>
  );
}

function Paso({ n }: { n: number }) {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full bg-marca-suave text-xs font-semibold text-marca"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

export function CodigosRespaldo({
  codigos,
  alContinuar,
}: {
  codigos: string[];
  alContinuar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [guardados, setGuardados] = useState(false);
  const texto = `Códigos de respaldo de NV Streaming\nCada código sirve una sola vez.\n\n${codigos.join('\n')}\n`;

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
  }

  function descargar() {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nv-streaming-codigos-respaldo.txt';
    a.click();
    URL.revokeObjectURL(url);
    setGuardados(true);
  }

  return (
    <div className="grid gap-5">
      <Alerta tono="exito" titulo="Verificación en dos pasos activada">
        Guarda estos códigos en un lugar seguro. Te permiten entrar si pierdes el teléfono y no
        volverás a verlos.
      </Alerta>
      <ul
        className="grid grid-cols-2 gap-2 rounded-xl border border-borde bg-hundida p-4 font-mono text-sm"
        aria-label="Códigos de respaldo"
      >
        {codigos.map((c) => (
          <li key={c} className="text-center tracking-wider">
            {c}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Boton
          variante="secundario"
          onClick={copiar}
          icono={copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copiado ? 'Copiados' : 'Copiar'}
        </Boton>
        <Boton variante="secundario" onClick={descargar} icono={<Download className="size-4" />}>
          Descargar
        </Boton>
      </div>
      <label className="flex items-center gap-3 text-sm text-tinta-suave">
        <input
          type="checkbox"
          checked={guardados || copiado}
          onChange={(e) => setGuardados(e.target.checked)}
          className="size-4 accent-[var(--nv-marca)]"
        />
        Ya guardé mis códigos de respaldo
      </label>
      <Boton
        tamano="lg"
        disabled={!(guardados || copiado)}
        onClick={alContinuar}
        icono={<ShieldCheck className="size-4" />}
      >
        Continuar
      </Boton>
    </div>
  );
}

export function FormularioVerificacion({ destino }: { destino: string }) {
  const router = useRouter();
  const [conRespaldo, setConRespaldo] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [digitos, setDigitos] = useState(VACIO);
  const [respaldo, setRespaldo] = useState('');
  const [version, setVersion] = useState(0);

  async function verificar(cuerpo: { codigo: string } | { codigoRespaldo: string }) {
    if (cargando) return;
    setCargando(true);
    setError(null);
    const r = await llamarApi<SesionActual>('POST', '/auth/2fa/verificar', cuerpo);
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      setDigitos(VACIO);
      setVersion((v) => v + 1);
      return;
    }
    router.push(destino);
    router.refresh();
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (conRespaldo) {
      const codigo = respaldo.trim().toUpperCase();
      if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(codigo)) {
        setError({
          estado: 0,
          codigo: 'LOCAL',
          mensaje: 'El código de respaldo tiene el formato XXXXX-XXXXX.',
          campos: { codigoRespaldo: ['El código de respaldo tiene el formato XXXXX-XXXXX.'] },
        });
        return;
      }
      void verificar({ codigoRespaldo: codigo });
      return;
    }
    const codigo = digitos.join('');
    if (!/^\d{6}$/.test(codigo)) {
      setError({
        estado: 0,
        codigo: 'LOCAL',
        mensaje: 'Escribe los 6 dígitos del código.',
        campos: { codigo: ['Escribe los 6 dígitos del código.'] },
      });
      return;
    }
    void verificar({ codigo });
  }

  const campos = erroresPorCampo(error);
  return (
    <div className="grid gap-4">
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        {error && !error.campos && (
          <Alerta
            tono="peligro"
            titulo={error.codigo === 'CODIGO_INCORRECTO' ? 'Código incorrecto' : undefined}
          >
            {error.mensaje}
          </Alerta>
        )}
        {conRespaldo ? (
          <Campo
            etiqueta="Código de respaldo"
            name="codigoRespaldo"
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            required
            autoFocus
            value={respaldo}
            onChange={(e) => setRespaldo(e.currentTarget.value)}
            className="[&_input]:font-mono [&_input]:tracking-[0.12em] [&_input]:uppercase"
            error={campos.codigoRespaldo}
          />
        ) : (
          <CodigoOtp
            key={version}
            digitos={digitos}
            alCambiar={setDigitos}
            alCompletar={(codigo) => void verificar({ codigo })}
            invalido={Boolean(error)}
            error={campos.codigo}
          />
        )}
        <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
          Verificar
        </Boton>
      </form>
      <button
        type="button"
        onClick={() => {
          setConRespaldo((v) => !v);
          setError(null);
        }}
        className="justify-self-center text-sm font-semibold text-cian hover:underline"
      >
        {conRespaldo ? 'Usar el código de mi app' : 'Usar un código de respaldo'}
      </button>
    </div>
  );
}

const VACIO = ['', '', '', '', '', ''];

/**
 * Código de 6 dígitos en seis casillas: avanza solo al escribir, acepta pegar el
 * código entero (o que el teléfono lo rellene), retrocede con Borrar y envía al
 * completar la última casilla.
 */
export function CodigoOtp({
  digitos,
  alCambiar,
  alCompletar,
  invalido,
  error,
}: {
  digitos: string[];
  alCambiar: (digitos: string[]) => void;
  alCompletar: (codigo: string) => void;
  invalido?: boolean;
  error?: string | undefined;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[digitos.findIndex((d) => !d)]?.focus();
    // Solo al montar: después el foco lo mueve quien escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function poner(desde: number, texto: string) {
    const numeros = texto.replace(/\D/g, '').slice(0, 6 - desde);
    const nuevos = [...digitos];
    if (!numeros) {
      nuevos[desde] = '';
      alCambiar(nuevos);
      return;
    }
    [...numeros].forEach((d, j) => (nuevos[desde + j] = d));
    alCambiar(nuevos);
    const siguiente = nuevos.findIndex((d) => !d);
    refs.current[siguiente === -1 ? 5 : siguiente]?.focus();
    if (siguiente === -1) alCompletar(nuevos.join(''));
  }

  function tecla(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digitos[i] && i > 0) {
      e.preventDefault();
      const nuevos = [...digitos];
      nuevos[i - 1] = '';
      alCambiar(nuevos);
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  function pegar(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData('text');
    if (!/\d/.test(texto)) return;
    e.preventDefault();
    poner(texto.replace(/\D/g, '').length >= 6 ? 0 : i, texto);
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold text-tinta">Código de 6 dígitos</legend>
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_0.25rem_repeat(3,minmax(0,1fr))] gap-2">
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => poner(i, e.currentTarget.value)}
            onKeyDown={(e) => tecla(i, e)}
            onPaste={(e) => pegar(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Dígito ${i + 1}`}
            aria-invalid={invalido || error ? true : undefined}
            className={clsx(
              'h-14 w-full min-w-0 rounded-[0.9rem] border border-borde-fuerte bg-[rgb(10_14_32/0.9)] text-center font-titulo text-2xl font-bold text-tinta caret-cian transition-colors focus:border-cian focus:ring-3 focus:ring-acento-suave focus:outline-none aria-invalid:border-peligro',
              i === 3 && 'col-start-5',
            )}
          />
        ))}
      </div>
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
    </fieldset>
  );
}
