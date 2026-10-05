'use client';

import {
  type AutomatizacionResumen,
  CANALES_AVISO,
  type CanalAviso,
  type EstadoCanales,
  FUENTES_TASA,
  type FuenteTasa,
  PRIORIDADES_TICKET,
  type PruebaTasa,
  type TipoAutomatizacion,
} from '@nv/shared';
import clsx from 'clsx';
import { FlaskConical, Play, Send } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Interruptor } from '@/componentes/ui/interruptor';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import {
  CANAL_AVISO,
  type CampoParametro,
  camposDe,
  erroresParametros,
  FUENTE_TASA,
  fechaHoraLargaVenezuela,
  textoHora,
  validarParametros,
} from '@/lib/automatizaciones';
import { PRIORIDAD_TICKET } from '@/lib/estados';
import { formatearTasa } from './formato-admin';
import { ErrorGeneral, useAccion } from './piezas';

const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Copia de los errores sin el de un campo. */
function sinError(errores: Record<string, string>, clave: string): Record<string, string> {
  const copia = { ...errores };
  delete copia[clave];
  return copia;
}

// ── Encender y apagar ───────────────────────────────────────────────────────

/** Interruptor de una automatización, con su estado en texto al lado. */
export function InterruptorAutomatizacion({
  tipo,
  nombre,
  activa,
}: {
  tipo: TipoAutomatizacion;
  nombre: string;
  activa: boolean;
}) {
  const id = useId();
  const { cargando, error, ejecutar } = useAccion();
  // Refleja el cambio al momento; si la API lo rechaza, vuelve al valor del servidor.
  const [pedido, setPedido] = useState<boolean | null>(null);
  const valor = pedido ?? activa;

  async function cambiar(nuevo: boolean) {
    setPedido(nuevo);
    const r = await ejecutar('PATCH', `/automatizaciones/${tipo}`, { activa: nuevo });
    if (!r) setPedido(null);
  }

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex items-center gap-2.5">
        <span
          id={`${id}-estado`}
          className={clsx('text-xs font-medium', valor ? 'text-exito' : 'text-tinta-tenue')}
        >
          {valor ? 'Activa' : 'Pausada'}
        </span>
        <Interruptor
          activo={valor}
          cargando={cargando}
          onCambiar={(v) => void cambiar(v)}
          aria-label={nombre}
          aria-describedby={`${id}-estado`}
        />
      </div>
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs text-peligro">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}

// ── Ejecutar ahora ──────────────────────────────────────────────────────────

export function EjecutarAhora({
  tipo,
  nombre,
  className,
}: {
  tipo: TipoAutomatizacion;
  nombre: string;
  className?: string;
}) {
  const { cargando, error, ejecutar } = useAccion();
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function ejecutarAhora() {
    setMensaje(null);
    const r = await ejecutar<{ mensaje?: string }>('POST', `/automatizaciones/${tipo}/ejecutar`);
    if (r)
      setMensaje(r.datos?.mensaje ?? 'Ejecución en cola. En unos segundos verás el resultado.');
  }

  return (
    <div className={clsx('grid gap-1.5', className)}>
      <Boton
        variante="secundario"
        tamano="sm"
        cargando={cargando}
        icono={<Play className="size-3.5" aria-hidden="true" />}
        onClick={() => void ejecutarAhora()}
        aria-label={`Ejecutar ahora: ${nombre}`}
      >
        Ejecutar ahora
      </Boton>
      {mensaje && (
        <p role="status" className="text-xs text-exito">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-peligro">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}

// ── Formulario de configuración ─────────────────────────────────────────────

type Valores = Record<string, string | number[]>;

function valoresIniciales(campos: CampoParametro[], parametros: Record<string, unknown>): Valores {
  const v: Valores = {};
  for (const c of campos) {
    const actual = parametros[c.clave];
    if (c.tipo === 'horas') v[c.clave] = Array.isArray(actual) ? actual.map(Number) : [];
    else if (c.tipo === 'lista-dias')
      v[c.clave] = Array.isArray(actual)
        ? [...actual]
            .map(Number)
            .sort((a, b) => b - a)
            .join(', ')
        : '';
    else v[c.clave] = actual === undefined || actual === null ? '' : String(actual);
  }
  return v;
}

/** Valores del formulario tal como los espera el esquema del tipo. */
function aParametros(campos: CampoParametro[], valores: Valores): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const c of campos) {
    const v = valores[c.clave];
    if (c.tipo === 'horas') p[c.clave] = [...(v as number[])].sort((a, b) => a - b);
    else if (c.tipo === 'lista-dias')
      p[c.clave] = String(v)
        .split(/[\s,;]+/)
        .filter(Boolean);
    else p[c.clave] = String(v).trim();
  }
  return p;
}

export function FormularioAutomatizacion({
  automatizacion: a,
  editable,
  canales: estadoCanales,
}: {
  automatizacion: AutomatizacionResumen;
  editable: boolean;
  canales: EstadoCanales;
}) {
  const campos = camposDe(a.tipo);
  const [valores, setValores] = useState<Valores>(() => valoresIniciales(campos, a.parametros));
  const [canales, setCanales] = useState<CanalAviso[]>(a.canales);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const { cargando, error, ejecutar, limpiar } = useAccion();

  const poner = (clave: string, v: string | number[]) => {
    setValores((prev) => ({ ...prev, [clave]: v }));
    setGuardado(false);
    limpiar();
    setErrores((prev) => sinError(prev, clave));
  };

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardado(false);
    const nuevos: Record<string, string> = {};
    if (canales.length === 0) nuevos.canales = 'Elige al menos un canal.';
    const r = validarParametros(a.tipo, aParametros(campos, valores));
    if (!r.ok) Object.assign(nuevos, r.errores);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !r.ok) return;

    const ordenados = CANALES_AVISO.filter((c) => canales.includes(c));
    const hecho = await ejecutar('PATCH', `/automatizaciones/${a.tipo}`, {
      canales: ordenados,
      parametros: r.datos,
    });
    if (hecho) setGuardado(true);
  }

  const erroresServidor = error?.campos ? erroresParametros(a.tipo, error.campos) : {};
  const errorDe = (clave: string) => errores[clave] ?? erroresServidor[clave];
  // Errores de la API que no corresponden a ningún campo visible.
  const conocidas = new Set(['canales', ...campos.map((c) => c.clave)]);
  const errorSuelto = Object.entries(erroresServidor).find(([k]) => !conocidas.has(k))?.[1];
  const soloCorreo = a.canalesPermitidos.length === 1;

  return (
    <form onSubmit={enviar} className="grid gap-6" noValidate aria-label={`Configurar ${a.nombre}`}>
      <fieldset className="grid gap-3" disabled={!editable}>
        <legend className="mb-1 text-sm font-semibold">Canales</legend>
        {soloCorreo ? (
          <p className="text-sm text-tinta-suave">
            Se envía por {CANAL_AVISO[a.canalesPermitidos[0]!].toLowerCase()}. Los avisos al equipo
            y a los revendedores solo van por correo.
          </p>
        ) : (
          <div className="grid gap-3">
            {a.canalesPermitidos.map((c) => (
              <Casilla
                key={c}
                name="canales"
                value={c}
                checked={canales.includes(c)}
                onChange={(e) => {
                  const marcado = e.currentTarget.checked;
                  setCanales((prev) => (marcado ? [...prev, c] : prev.filter((x) => x !== c)));
                  setGuardado(false);
                  setErrores((prev) => sinError(prev, 'canales'));
                }}
                etiqueta={CANAL_AVISO[c]}
                ayuda={
                  c === 'whatsapp'
                    ? 'Opcional. Solo llega a clientes que aceptaron recibir WhatsApp y usa plantillas aprobadas por Meta.'
                    : 'Al correo de la cuenta del cliente.'
                }
              />
            ))}
            {canales.includes('whatsapp') && estadoCanales.whatsapp.proveedor === 'desactivado' && (
              <Alerta tono="aviso">
                WhatsApp está desactivado en el servidor: los avisos por este canal quedarán como
                omitidos hasta que se configure.
              </Alerta>
            )}
          </div>
        )}
        {errorDe('canales') && (
          <p className="text-xs font-medium text-peligro">{errorDe('canales')}</p>
        )}
      </fieldset>

      <fieldset className="grid gap-4" disabled={!editable}>
        <legend className="mb-1 text-sm font-semibold">Parámetros</legend>
        {campos.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            No tiene parámetros: se envía en cuanto ocurre el cambio que la dispara.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {campos.map((c) => (
              <CampoAutomatizacion
                key={c.clave}
                campo={c}
                valor={valores[c.clave] ?? ''}
                error={errorDe(c.clave)}
                onCambiar={(v) => poner(c.clave, v)}
                fuentesTasa={estadoCanales.fuentesTasa}
              />
            ))}
          </div>
        )}
      </fieldset>

      {editable && (
        <>
          <ErrorGeneral error={error} />
          {errorSuelto && <Alerta tono="peligro">{errorSuelto}</Alerta>}
          {Object.keys(errores).length > 0 && (
            <p role="alert" className="text-sm text-peligro">
              Revisa los campos marcados.
            </p>
          )}
          {guardado && (
            <Alerta tono="exito">
              Cambios guardados. Se aplican desde la próxima ejecución y quedan en la auditoría.
            </Alerta>
          )}
          <div>
            <Boton type="submit" cargando={cargando}>
              Guardar cambios
            </Boton>
          </div>
        </>
      )}
    </form>
  );
}

function CampoAutomatizacion({
  campo: c,
  valor,
  error,
  onCambiar,
  fuentesTasa,
}: {
  campo: CampoParametro;
  valor: string | number[];
  error: string | undefined;
  onCambiar: (v: string | number[]) => void;
  fuentesTasa: EstadoCanales['fuentesTasa'];
}) {
  const id = useId();
  const texto = Array.isArray(valor) ? '' : valor;
  const etiqueta = c.sufijo ? `${c.etiqueta} (${c.sufijo})` : c.etiqueta;

  switch (c.tipo) {
    case 'hora':
      return (
        <Selector
          etiqueta={c.etiqueta}
          name={c.clave}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          ayuda={c.ayuda}
          error={error}
        >
          {HORAS.map((h) => (
            <option key={h} value={String(h)}>
              {textoHora(h)}
            </option>
          ))}
        </Selector>
      );
    case 'prioridad':
      return (
        <Selector
          etiqueta={c.etiqueta}
          name={c.clave}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          ayuda={c.ayuda}
          error={error}
        >
          {PRIORIDADES_TICKET.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_TICKET[p].texto}
            </option>
          ))}
        </Selector>
      );
    case 'fuente':
      return (
        <Selector
          etiqueta={c.etiqueta}
          name={c.clave}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          ayuda={
            fuentesTasa[texto as 'bcv' | 'json'] === false
              ? 'Esta fuente no está configurada en el servidor: la consulta fallará.'
              : 'Se consulta a las horas indicadas.'
          }
          error={error}
        >
          {(['bcv', 'json'] as const).map((f) => (
            <option key={f} value={f}>
              {FUENTE_TASA[f].nombre}
              {fuentesTasa[f] ? '' : ' (no configurada)'}
            </option>
          ))}
        </Selector>
      );
    case 'horas': {
      const marcadas = Array.isArray(valor) ? valor : [];
      return (
        <fieldset
          className="grid gap-2 sm:col-span-2"
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
        >
          <legend className="mb-1.5 text-sm font-medium">{c.etiqueta}</legend>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {HORAS.map((h) => {
              const activa = marcadas.includes(h);
              return (
                <label
                  key={h}
                  className={clsx(
                    'flex h-9 cursor-pointer items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition-colors',
                    'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-marca-suave has-[:disabled]:cursor-not-allowed',
                    activa
                      ? 'border-marca bg-marca-suave text-tinta'
                      : 'border-borde bg-hundida text-tinta-suave hover:border-tinta-tenue',
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={activa}
                    onChange={(e) =>
                      onCambiar(
                        e.currentTarget.checked
                          ? [...marcadas, h]
                          : marcadas.filter((x) => x !== h),
                      )
                    }
                  />
                  {textoHora(h)}
                </label>
              );
            })}
          </div>
          <p id={`${id}-ayuda`} className="text-xs text-tinta-tenue">
            {c.ayuda}
          </p>
          {error && (
            <p id={`${id}-error`} className="text-xs font-medium text-peligro">
              {error}
            </p>
          )}
        </fieldset>
      );
    }
    case 'lista-dias':
      return (
        <Campo
          etiqueta={c.etiqueta}
          name={c.clave}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          inputMode="numeric"
          autoComplete="off"
          ayuda={c.ayuda}
          error={error}
        />
      );
    case 'monto-usd':
      return (
        <Campo
          etiqueta={etiqueta}
          name={c.clave}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          inputMode="decimal"
          autoComplete="off"
          ayuda={c.ayuda}
          error={error}
        />
      );
    default:
      return (
        <Campo
          etiqueta={etiqueta}
          name={c.clave}
          type="number"
          min={c.min}
          max={c.max}
          step={1}
          value={texto}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          inputMode="numeric"
          ayuda={c.ayuda}
          error={error}
        />
      );
  }
}

// ── Probar la fuente de la tasa ─────────────────────────────────────────────

export function ProbarFuenteTasa({
  variacionMaximaPct,
  fuenteGuardada,
  fuentesTasa,
}: {
  variacionMaximaPct: number;
  fuenteGuardada: FuenteTasa;
  fuentesTasa: EstadoCanales['fuentesTasa'];
}) {
  const [fuente, setFuente] = useState<FuenteTasa>(fuenteGuardada);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<PruebaTasa | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function probar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<PruebaTasa>('POST', '/automatizaciones/tasa/probar', { fuente });
    setCargando(false);
    if (!r.ok) {
      setResultado(null);
      setError(r.error.mensaje);
      return;
    }
    setResultado(r.datos);
  }

  const variacion = resultado?.variacionPct != null ? Number(resultado.variacionPct) : null;
  const excede = variacion !== null && Math.abs(variacion) > variacionMaximaPct;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-tinta-suave">
        Consulta ahora la fuente y compara el valor con la tasa vigente. No registra nada.
      </p>
      <Selector
        etiqueta="Fuente a probar"
        value={fuente}
        onChange={(e) => {
          setFuente(e.currentTarget.value as FuenteTasa);
          setResultado(null);
          setError(null);
        }}
      >
        {FUENTES_TASA.map((f) => (
          <option key={f} value={f}>
            {f === 'bcv' ? 'BCV' : 'Fuente externa (JSON)'}
            {f === fuenteGuardada ? ' · guardada' : ''}
            {fuentesTasa[f] ? '' : ' · no configurada'}
          </option>
        ))}
      </Selector>
      <Boton
        variante="secundario"
        cargando={cargando}
        icono={<FlaskConical className="size-4" aria-hidden="true" />}
        onClick={() => void probar()}
        className="justify-self-start"
      >
        Probar fuente
      </Boton>
      {error && <Alerta tono="peligro">{error}</Alerta>}
      {resultado && (
        <div role="status" className="grid gap-3 rounded-xl border border-borde bg-hundida p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="grid gap-0.5">
              <dt className="text-xs text-tinta-tenue">
                Obtenida ({resultado.fuente === 'bcv' ? 'BCV' : 'fuente externa'})
              </dt>
              <dd className="font-titulo text-base font-semibold break-words tabular-nums">
                {formatearTasa(resultado.valor, 'VES')}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs text-tinta-tenue">Vigente</dt>
              <dd className="font-titulo text-base font-semibold break-words tabular-nums">
                {resultado.vigente ? formatearTasa(resultado.vigente, 'VES') : 'Sin tasa'}
              </dd>
            </div>
            <div className="col-span-2 grid gap-0.5">
              <dt className="text-xs text-tinta-tenue">Variación</dt>
              <dd className={clsx('font-medium tabular-nums', excede && 'text-aviso')}>
                {variacion === null
                  ? 'Sin tasa vigente con la que comparar'
                  : `${variacion > 0 ? '+' : ''}${variacion.toLocaleString('es-VE', { maximumFractionDigits: 2 })} %`}
              </dd>
            </div>
          </dl>
          {excede && (
            <Alerta tono="aviso">
              Supera la variación máxima ({variacionMaximaPct} %): la automatización no la aplicaría
              y avisaría a administración.
            </Alerta>
          )}
          <p className="text-xs text-tinta-tenue">
            Consultada el {fechaHoraLargaVenezuela(resultado.obtenidaEn)} (hora de Venezuela).
          </p>
        </div>
      )}
    </div>
  );
}

// ── Aviso de prueba ─────────────────────────────────────────────────────────

export function EnviarPrueba({ whatsapp }: { whatsapp: EstadoCanales['whatsapp'] | null }) {
  const [canal, setCanal] = useState<CanalAviso>('correo');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensaje(null);
    const formulario = e.currentTarget;
    const destino = String(new FormData(formulario).get('destino') ?? '').trim();
    const r = await ejecutar<{ mensaje?: string }>('POST', '/notificaciones/prueba', {
      canal,
      destino,
    });
    if (r) {
      setMensaje(r.datos?.mensaje ?? 'Aviso de prueba enviado.');
      formulario.reset();
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate aria-label="Enviar aviso de prueba">
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Selector
          etiqueta="Canal"
          name="canal"
          value={canal}
          onChange={(e) => {
            setCanal(e.currentTarget.value as CanalAviso);
            setMensaje(null);
          }}
          error={campos.canal}
        >
          {CANALES_AVISO.map((c) => (
            <option key={c} value={c}>
              {CANAL_AVISO[c]}
            </option>
          ))}
        </Selector>
        <Campo
          key={canal}
          etiqueta={canal === 'correo' ? 'Correo de destino' : 'Teléfono de destino'}
          name="destino"
          type={canal === 'correo' ? 'email' : 'tel'}
          autoComplete="off"
          placeholder={canal === 'correo' ? 'persona@ejemplo.com' : '+584121234567'}
          ayuda={
            canal === 'correo'
              ? 'Recibe un correo corto de prueba.'
              : 'En formato internacional. Usa un número de tu equipo, no el de un cliente.'
          }
          required
          error={campos.destino}
        />
      </div>
      {canal === 'whatsapp' && whatsapp && whatsapp.proveedor === 'desactivado' && (
        <Alerta tono="aviso">
          WhatsApp está desactivado en el servidor: la prueba quedará registrada como omitida.
        </Alerta>
      )}
      {canal === 'whatsapp' &&
        whatsapp &&
        whatsapp.proveedor !== 'desactivado' &&
        !whatsapp.listo && (
          <Alerta tono="aviso">
            Faltan credenciales de WhatsApp en el servidor: es probable que la prueba falle.
          </Alerta>
        )}
      <ErrorGeneral error={error} />
      {mensaje && <Alerta tono="exito">{mensaje}</Alerta>}
      <div>
        <Boton
          type="submit"
          variante="secundario"
          cargando={cargando}
          icono={<Send className="size-4" aria-hidden="true" />}
        >
          Enviar prueba
        </Boton>
      </div>
    </form>
  );
}
