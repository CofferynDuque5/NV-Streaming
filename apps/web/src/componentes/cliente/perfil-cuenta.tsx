'use client';

import {
  INFO_MONEDA,
  MONEDAS,
  type Moneda,
  requisitosContrasena,
  type SesionListada,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { CodigosRespaldo, ConfiguradorDosPasos } from '@/componentes/acceso/dos-pasos';
import { Bandera } from '@/componentes/tienda/iconos';
import { Boton } from '@/componentes/ui/boton';
import { Interruptor } from '@/componentes/ui/interruptor';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { claseEntrada, Mensaje, MensajeError, PildoraEstado, type Validacion } from './pago';
import { claseCaja, claseEnlace, PAISES } from './piezas-cuenta';

/** Caja de una sección del perfil: título, explicación y, a la derecha, su acción. */
export function CajaPerfil({
  titulo,
  descripcion,
  accion,
  children,
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={claseCaja}>
      <header className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="grid gap-0.5">
          <h2 id={id} className="text-lg">
            {titulo}
          </h2>
          <p className="text-[0.84rem] text-tinta-suave">{descripcion}</p>
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

function Etiqueta({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold">
      {children}
    </label>
  );
}

/* ───────────────────────── tus datos ───────────────────────── */

export interface DatosIniciales {
  nombre: string;
  correo: string;
  documento: string | null;
  pais: string | null;
  monedaPreferida: Moneda;
  whatsapp: string | null;
  aceptaWhatsapp: boolean;
}

function validarNombre(v: string): Validacion {
  const n = v.trim().length;
  if (n < 2) return ['mal', 'Escribe tu nombre.'];
  if (n > 120) return ['mal', 'Máximo 120 caracteres.'];
  return ['ok', ''];
}

function validarWhatsapp(v: string): Validacion {
  if (!v.trim()) return ['', 'Para avisos de vencimiento y pagos'];
  return /^\+\d{7,15}$/.test(v.replace(/[\s().-]/g, ''))
    ? ['ok', 'Número listo']
    : ['mal', 'Escríbelo con el código de país, por ejemplo +58 412 0000000.'];
}

/** Nombre (cuenta) y datos de facturación (cliente) en un solo formulario. */
export function TusDatos({ inicial }: { inicial: DatosIniciales }) {
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [documento, setDocumento] = useState(inicial.documento ?? '');
  const [whatsapp, setWhatsapp] = useState(inicial.whatsapp ?? '');
  const [pais, setPais] = useState(inicial.pais ?? '');
  const [moneda, setMoneda] = useState<Moneda>(inicial.monedaPreferida);
  const [acepta, setAcepta] = useState(inicial.aceptaWhatsapp);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);
  const refNombre = useRef<HTMLInputElement>(null);
  const refWhatsapp = useRef<HTMLInputElement>(null);

  const vNombre: Validacion = campos.nombre ? ['mal', campos.nombre] : validarNombre(nombre);
  const vWhatsapp: Validacion = campos.whatsapp
    ? ['mal', campos.whatsapp]
    : validarWhatsapp(whatsapp);
  const paises =
    inicial.pais && !PAISES[inicial.pais] ? { ...PAISES, [inicial.pais]: inicial.pais } : PAISES;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (validarNombre(nombre)[0] === 'mal') return refNombre.current?.focus();
    if (validarWhatsapp(whatsapp)[0] === 'mal') return refWhatsapp.current?.focus();
    setCargando(true);
    setError(null);
    if (nombre.trim() !== inicial.nombre) {
      const r = await llamarApi('PATCH', '/cuenta/perfil', { nombre: nombre.trim() });
      if (!r.ok) {
        setCargando(false);
        return setError(r.error);
      }
    }
    const r = await llamarApi('PATCH', '/mi/perfil', {
      documento: documento.trim(),
      pais,
      monedaPreferida: moneda,
      whatsapp: whatsapp.trim(),
      aceptaWhatsapp: acepta,
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar('Guardamos tus datos.');
    router.refresh();
  }

  return (
    <form noValidate onSubmit={guardar} className="grid gap-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-nombre`}>Nombre</Etiqueta>
          <input
            ref={refNombre}
            id={`${id}-nombre`}
            autoComplete="name"
            maxLength={120}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={vNombre[0] === 'mal' || undefined}
            aria-describedby={`${id}-nombre-ayuda`}
            className={claseEntrada(vNombre[0] === 'mal' ? 'mal' : '')}
          />
          <Mensaje
            id={`${id}-nombre-ayuda`}
            estado={vNombre[0] === 'mal' ? 'mal' : ''}
            texto={vNombre[0] === 'mal' ? vNombre[1] : ''}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-correo`}>Correo</Etiqueta>
          <input
            id={`${id}-correo`}
            value={inicial.correo}
            readOnly
            aria-describedby={`${id}-correo-ayuda`}
            className={clsx(claseEntrada(''), 'opacity-70')}
          />
          <Mensaje
            id={`${id}-correo-ayuda`}
            estado=""
            texto="Para cambiarlo escríbenos a soporte."
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-documento`}>Cédula o RIF</Etiqueta>
          <input
            id={`${id}-documento`}
            autoComplete="off"
            maxLength={40}
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            aria-describedby={`${id}-documento-ayuda`}
            className={claseEntrada(campos.documento ? 'mal' : '')}
          />
          <Mensaje
            id={`${id}-documento-ayuda`}
            estado={campos.documento ? 'mal' : ''}
            texto={campos.documento ?? 'Opcional. Aparece en tus facturas.'}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-whatsapp`}>WhatsApp</Etiqueta>
          <input
            ref={refWhatsapp}
            id={`${id}-whatsapp`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+58 412 0000000"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            aria-invalid={vWhatsapp[0] === 'mal' || undefined}
            aria-describedby={`${id}-whatsapp-ayuda`}
            className={claseEntrada(vWhatsapp[0])}
          />
          <Mensaje id={`${id}-whatsapp-ayuda`} estado={vWhatsapp[0]} texto={vWhatsapp[1]} />
        </div>
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-pais`}>País</Etiqueta>
          <select
            id={`${id}-pais`}
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            className={claseEntrada(campos.pais ? 'mal' : '')}
          >
            <option value="">Sin indicar</option>
            {Object.entries(paises).map(([codigo, n]) => (
              <option key={codigo} value={codigo}>
                {n}
              </option>
            ))}
          </select>
          {campos.pais && <Mensaje id={`${id}-pais-error`} estado="mal" texto={campos.pais} />}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span id={`${id}-moneda`} className="text-sm font-semibold">
          Moneda en la que prefieres pagar
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-moneda`} className="flex flex-wrap gap-2">
          {MONEDAS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={moneda === m}
              aria-label={`${INFO_MONEDA[m].nombre} (${m})`}
              className="chip"
              onClick={() => setMoneda(m)}
            >
              <Bandera moneda={m} decorativa />
              {m}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          className="mt-0.5 size-4.5 shrink-0 accent-marca"
        />
        <span className="grid gap-0.5">
          Acepto recibir avisos de pagos y vencimientos por WhatsApp
          <small className="text-[0.8rem] text-tinta-suave">
            Solo de tus servicios y pagos. Puedes retirar tu permiso cuando quieras.
          </small>
        </span>
      </label>

      {error && !error.campos && <MensajeError error={error} />}
      <Boton type="submit" cargando={cargando} className="justify-self-start">
        Guardar cambios
      </Boton>
    </form>
  );
}

/* ───────────────────────── contraseña ───────────────────────── */

/** Cambiar la contraseña con los requisitos marcados en vivo y la repetición. */
export function CambiarContrasena({ correo }: { correo: string }) {
  const notificar = useNotificar();
  const router = useRouter();
  const id = useId();
  const refActual = useRef<HTMLInputElement>(null);
  const refNueva = useRef<HTMLInputElement>(null);
  const refOtra = useRef<HTMLInputElement>(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [otra, setOtra] = useState('');
  const [ver, setVer] = useState(false);
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  const requisitos = requisitosContrasena(nueva, correo);
  const cumple = requisitos.every((r) => r.cumple);
  const coinciden = otra.length > 0 && otra === nueva;

  const vActual: Validacion = campos.actual
    ? ['mal', campos.actual]
    : intento && !actual
      ? ['mal', 'Escribe tu contraseña actual.']
      : ['', ''];
  const vNueva: Validacion = campos.nueva
    ? ['mal', campos.nueva]
    : nueva
      ? [cumple ? 'ok' : '', '']
      : intento
        ? ['mal', 'Escribe la contraseña nueva.']
        : ['', ''];
  const vOtra: Validacion = otra
    ? coinciden
      ? ['ok', 'Coinciden']
      : ['mal', 'No coinciden']
    : intento
      ? ['mal', 'Repite la contraseña nueva.']
      : ['', ''];

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (!actual) return refActual.current?.focus();
    if (!cumple) return refNueva.current?.focus();
    if (!coinciden) return refOtra.current?.focus();
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', '/cuenta/contrasena', { actual, nueva });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setActual('');
    setNueva('');
    setOtra('');
    setIntento(false);
    notificar('Contraseña cambiada. Cerramos tus otras sesiones.');
    router.refresh();
  }

  const tipo = ver ? 'text' : 'password';
  return (
    <form noValidate onSubmit={enviar} className="grid gap-3.5">
      <div className="grid gap-1.5">
        <Etiqueta htmlFor={`${id}-actual`}>Contraseña actual</Etiqueta>
        <input
          ref={refActual}
          id={`${id}-actual`}
          type={tipo}
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          aria-invalid={vActual[0] === 'mal' || undefined}
          aria-describedby={`${id}-actual-ayuda`}
          className={claseEntrada(vActual[0])}
        />
        <Mensaje id={`${id}-actual-ayuda`} estado={vActual[0]} texto={vActual[1]} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-nueva`}>Contraseña nueva</Etiqueta>
          <input
            ref={refNueva}
            id={`${id}-nueva`}
            type={tipo}
            autoComplete="new-password"
            maxLength={128}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            aria-invalid={vNueva[0] === 'mal' || undefined}
            aria-describedby={`${id}-requisitos ${id}-nueva-ayuda`}
            className={claseEntrada(vNueva[0])}
          />
          <ul
            id={`${id}-requisitos`}
            aria-label="Requisitos de la contraseña"
            className="grid gap-1.5 text-[0.8rem] text-tinta-suave"
          >
            {requisitos.map((r) => (
              <li
                key={r.clave}
                className={clsx('flex items-center gap-2', r.cumple && 'text-exito')}
              >
                <i
                  aria-hidden="true"
                  className={clsx(
                    'grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] not-italic',
                    r.cumple ? 'border-exito bg-exito/15' : 'border-borde-fuerte',
                  )}
                >
                  {r.cumple && <Check className="size-2.5" />}
                </i>
                {r.texto}
                <span className="sr-only">{r.cumple ? ': cumple' : ': falta'}</span>
              </li>
            ))}
          </ul>
          <Mensaje id={`${id}-nueva-ayuda`} estado={vNueva[0]} texto={vNueva[1]} />
        </div>
        <div className="grid content-start gap-1.5">
          <Etiqueta htmlFor={`${id}-otra`}>Repítela</Etiqueta>
          <input
            ref={refOtra}
            id={`${id}-otra`}
            type={tipo}
            autoComplete="new-password"
            maxLength={128}
            value={otra}
            onChange={(e) => setOtra(e.target.value)}
            aria-invalid={vOtra[0] === 'mal' || undefined}
            aria-describedby={`${id}-otra-ayuda`}
            className={claseEntrada(vOtra[0])}
          />
          <Mensaje id={`${id}-otra-ayuda`} estado={vOtra[0]} texto={vOtra[1]} />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={ver}
          onChange={(e) => setVer(e.target.checked)}
          className="size-4.5 shrink-0 accent-marca"
        />
        Mostrar contraseñas
      </label>
      {error && !error.campos && <MensajeError error={error} />}
      <Boton type="submit" cargando={cargando} className="justify-self-start">
        Cambiar contraseña
      </Boton>
    </form>
  );
}

/* ───────────────────────── dos pasos ───────────────────────── */

interface EstadoDosPasos {
  activo: boolean;
  obligatorio: boolean;
  activadoEn: string | null;
  codigosRestantes: number;
}

function FilaDosPasos({
  color,
  titulo,
  texto,
  children,
}: {
  color: string;
  titulo: string;
  texto: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[0.875rem] border border-borde px-3.5 py-3">
      <span
        className="orbe orbe-sm size-10 after:hidden"
        style={{ '--c': color } as CSSProperties}
        aria-hidden="true"
      >
        <ShieldCheck className="size-4.5" />
      </span>
      <div className="grid min-w-0 flex-[1_1_12.5rem] gap-0.5">
        <b className="text-[0.92rem]">{titulo}</b>
        <span className="text-[0.82rem] text-tinta-suave">{texto}</span>
      </div>
      {children}
    </div>
  );
}

/** Estado de la verificación en dos pasos y sus acciones (activar, códigos, desactivar). */
export function DosPasos({ estado }: { estado: EstadoDosPasos }) {
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const [configurando, setConfigurando] = useState(false);
  const [modo, setModo] = useState<'regenerar' | 'desactivar' | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  if (codigos) return <CodigosRespaldo codigos={codigos} alContinuar={() => setCodigos(null)} />;

  if (!estado.activo) {
    if (configurando) return <ConfiguradorDosPasos />;
    return (
      <FilaDosPasos
        color="#f59e0b"
        titulo="Dos pasos desactivado"
        texto="Agrega un código de tu teléfono al ingresar. Es la mejor protección."
      >
        <Boton onClick={() => setConfigurando(true)}>Activar dos pasos</Boton>
      </FilaDosPasos>
    );
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setCargando(true);
    setError(null);
    if (modo === 'regenerar') {
      const r = await llamarApi<{ codigosRespaldo: string[] }>(
        'POST',
        '/cuenta/2fa/codigos-respaldo',
        { codigo: d.get('codigo') },
      );
      setCargando(false);
      if (!r.ok) return setError(r.error);
      setCodigos(r.datos.codigosRespaldo);
      setModo(null);
      router.refresh();
    } else {
      const r = await llamarApi('POST', '/cuenta/2fa/desactivar', {
        contrasena: d.get('contrasena'),
        codigo: d.get('codigo'),
      });
      setCargando(false);
      if (!r.ok) return setError(r.error);
      setModo(null);
      notificar('Verificación en dos pasos desactivada.');
      router.refresh();
    }
  }

  return (
    <div className="grid gap-3">
      <FilaDosPasos
        color="#22c55e"
        titulo="Dos pasos activado"
        texto={`Te pedimos un código de tu app al ingresar. ${estado.codigosRestantes} ${estado.codigosRestantes === 1 ? 'código de respaldo disponible' : 'códigos de respaldo disponibles'}.`}
      >
        {!modo && (
          <>
            <Boton variante="secundario" onClick={() => setModo('regenerar')}>
              Nuevos códigos de respaldo
            </Boton>
            {!estado.obligatorio && (
              <button
                type="button"
                className="text-sm font-semibold text-peligro hover:underline"
                onClick={() => setModo('desactivar')}
              >
                Desactivar
              </button>
            )}
          </>
        )}
      </FilaDosPasos>
      {estado.codigosRestantes <= 3 && !modo && (
        <p className="text-[0.84rem] text-aviso">
          Te quedan pocos códigos de respaldo. Genera unos nuevos.
        </p>
      )}
      {modo && (
        <form
          key={modo}
          noValidate
          onSubmit={enviar}
          className={clsx(
            'grid gap-3 rounded-2xl border p-3.5',
            modo === 'desactivar' ? 'border-peligro/35 bg-peligro/[0.05]' : 'border-borde',
          )}
        >
          {modo === 'desactivar' && (
            <div className="grid gap-1.5">
              <Etiqueta htmlFor={`${id}-contrasena`}>Contraseña</Etiqueta>
              <input
                id={`${id}-contrasena`}
                name="contrasena"
                type="password"
                autoComplete="current-password"
                className={claseEntrada(campos.contrasena ? 'mal' : '')}
              />
              {campos.contrasena && (
                <Mensaje id={`${id}-c-error`} estado="mal" texto={campos.contrasena} />
              )}
            </div>
          )}
          <div className="grid max-w-[14rem] gap-1.5">
            <Etiqueta htmlFor={`${id}-codigo`}>Código de tu aplicación</Etiqueta>
            <input
              id={`${id}-codigo`}
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className={claseEntrada(campos.codigo ? 'mal' : '')}
            />
            {campos.codigo && <Mensaje id={`${id}-k-error`} estado="mal" texto={campos.codigo} />}
          </div>
          {error && !error.campos && <MensajeError error={error} />}
          <div className="flex flex-wrap items-center gap-2.5">
            <Boton
              type="submit"
              variante={modo === 'desactivar' ? 'peligro' : 'primario'}
              cargando={cargando}
            >
              {modo === 'desactivar' ? 'Desactivar' : 'Generar códigos nuevos'}
            </Boton>
            <button
              type="button"
              className={claseEnlace}
              onClick={() => {
                setError(null);
                setModo(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ───────────────────────── sesiones ───────────────────────── */

export interface SesionVista extends SesionListada {
  /** «IP 190.36.1.12 · última vez hace 2 días», formada en el servidor. */
  detalle: string;
}

export function CerrarOtrasSesiones() {
  const router = useRouter();
  const notificar = useNotificar();
  const [cargando, setCargando] = useState(false);
  async function cerrar() {
    setCargando(true);
    const r = await llamarApi('POST', '/cuenta/sesiones/cerrar-otras', {});
    setCargando(false);
    if (!r.ok) return notificar(r.error.mensaje, 'error');
    notificar('Cerramos tus otras sesiones.');
    router.refresh();
  }
  return (
    <Boton variante="secundario" tamano="sm" cargando={cargando} onClick={() => void cerrar()}>
      Cerrar las demás
    </Boton>
  );
}

export function ListaSesiones({ sesiones }: { sesiones: SesionVista[] }) {
  const router = useRouter();
  const notificar = useNotificar();
  const [cerrando, setCerrando] = useState<string | null>(null);

  async function cerrar(s: SesionVista) {
    setCerrando(s.id);
    const r = await llamarApi('DELETE', `/cuenta/sesiones/${s.id}`);
    setCerrando(null);
    if (!r.ok) return notificar(r.error.mensaje, 'error');
    notificar(`Cerramos la sesión de ${s.dispositivo}.`);
    router.refresh();
  }

  return (
    <ul className="grid [&>*+*]:border-t [&>*+*]:border-borde">
      {sesiones.map((s) => (
        <li key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
          <span
            className="grid size-9 place-items-center rounded-xl border border-borde-fuerte text-tinta-suave"
            aria-hidden="true"
          >
            {/Android|iOS|iPhone/.test(s.dispositivo) ? (
              <Smartphone className="size-4" />
            ) : (
              <Monitor className="size-4" />
            )}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <b className="truncate text-sm">
              {s.dispositivo}
              {s.actual ? ' · este dispositivo' : ''}
            </b>
            <small className="truncate text-[0.8rem] text-tinta-suave">{s.detalle}</small>
          </span>
          {s.actual ? (
            <PildoraEstado texto="Actual" tono="exito" />
          ) : (
            <button
              type="button"
              className={claseEnlace}
              disabled={cerrando !== null}
              aria-label={`Cerrar la sesión de ${s.dispositivo}`}
              onClick={() => void cerrar(s)}
            >
              {cerrando === s.id ? 'Cerrando…' : 'Cerrar'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── avisos ───────────────────────── */

export function Recordatorios({ recibir }: { recibir: boolean }) {
  const router = useRouter();
  const notificar = useNotificar();
  const [valor, setValor] = useState(recibir);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function cambiar(nuevo: boolean) {
    setValor(nuevo);
    setCargando(true);
    setError(null);
    setAviso(null);
    const r = await llamarApi<{ recibirRecordatorios: boolean }>(
      'PUT',
      '/autoservicio/preferencias',
      { recibirRecordatorios: nuevo },
    );
    setCargando(false);
    if (!r.ok) {
      setValor(!nuevo);
      setError(r.error);
      notificar('No pudimos guardar tu preferencia. Inténtalo de nuevo.', 'error');
      return;
    }
    setValor(r.datos.recibirRecordatorios);
    setAviso(
      r.datos.recibirRecordatorios
        ? 'Listo: te avisaremos antes de que venza tu suscripción.'
        : 'Listo: ya no te enviaremos recordatorios de vencimiento.',
    );
    router.refresh();
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex items-start gap-3">
        <Interruptor
          activo={valor}
          cargando={cargando}
          onCambiar={(v) => void cambiar(v)}
          aria-labelledby="preferencia-recordatorios"
          aria-describedby="preferencia-recordatorios-ayuda"
          className="mt-0.5"
        />
        <div className="grid gap-0.5 text-sm">
          <span id="preferencia-recordatorios" className="font-semibold">
            Recibir recordatorios de vencimiento
          </span>
          <small id="preferencia-recordatorios-ayuda" className="text-[0.8rem] text-tinta-suave">
            Te escribimos unos días antes de que venza cada servicio. Aunque los desactives,
            seguirás recibiendo las facturas, los avisos de pago y los de suspensión del servicio.
          </small>
        </div>
      </div>
      {aviso && (
        <p role="status" className="flex items-center gap-1.5 text-[0.84rem] text-exito">
          <Check className="size-4" aria-hidden="true" />
          {aviso}
        </p>
      )}
      {error && <MensajeError error={error} />}
    </div>
  );
}
