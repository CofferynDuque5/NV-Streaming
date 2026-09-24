'use client';

import type { SesionActual } from '@nv/shared';
import { Check, Copy, Download, QrCode, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
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

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const codigo = String(new FormData(e.currentTarget).get('codigo') ?? '').replace(/\s/g, '');
    const r = await llamarApi<{ codigosRespaldo: string[]; sesion: SesionActual }>(
      'POST',
      '/cuenta/2fa/confirmar',
      { codigo },
    );
    setCargando(false);
    if (r.ok) setCodigos(r.datos.codigosRespaldo);
    else setError(r.error);
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
    <form onSubmit={confirmar} className="grid gap-5" noValidate>
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
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <Campo
        etiqueta="Código de 6 dígitos"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
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

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const valor = String(new FormData(e.currentTarget).get('codigo') ?? '');
    const cuerpo = conRespaldo
      ? { codigoRespaldo: valor.trim().toUpperCase() }
      : { codigo: valor.replace(/\s/g, '') };
    const r = await llamarApi<SesionActual>('POST', '/auth/2fa/verificar', cuerpo);
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      return;
    }
    router.push(destino);
    router.refresh();
  }

  const campos = erroresPorCampo(error);
  const errorCampo = campos.codigo ?? campos.codigoRespaldo;
  return (
    <form
      onSubmit={enviar}
      className="grid gap-4"
      noValidate
      key={conRespaldo ? 'respaldo' : 'totp'}
    >
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {conRespaldo ? (
        <Campo
          etiqueta="Código de respaldo"
          name="codigo"
          placeholder="XXXXX-XXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          required
          autoFocus
          error={errorCampo}
        />
      ) : (
        <Campo
          etiqueta="Código de 6 dígitos"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          autoFocus
          error={errorCampo}
        />
      )}
      <Boton type="submit" tamano="lg" cargando={cargando} className="w-full">
        Verificar
      </Boton>
      <button
        type="button"
        onClick={() => {
          setConRespaldo((v) => !v);
          setError(null);
        }}
        className="text-sm font-medium text-marca hover:underline"
      >
        {conRespaldo ? 'Usar la aplicación de autenticación' : 'Usar un código de respaldo'}
      </button>
    </form>
  );
}
