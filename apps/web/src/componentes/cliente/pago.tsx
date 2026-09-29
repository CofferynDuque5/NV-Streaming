'use client';

import {
  formatearMonto,
  INFO_MONEDA,
  type MetodoCobroPublico,
  type Moneda,
  type OpcionesPagoEnLinea,
  type PagoPublico,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  FileText,
  Globe,
  Landmark,
  LoaderCircle,
  Send,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Bandera } from '@/componentes/tienda/iconos';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { AccionPagoEnLinea } from './pago-en-linea';

/* ─────────────────────────── piezas comunes ─────────────────────────── */

/**
 * Dirección de la factura que se está pagando. Tras pagar o cambiar la moneda,
 * la página vuelve a ella (en el pedido, sin `?factura=` se elegiría otra).
 */
const VolverA = createContext<string | null>(null);

function useActualizarPago() {
  const router = useRouter();
  const volver = useContext(VolverA);
  return (destino: string | null = volver) => {
    const aqui = window.location.pathname + window.location.search;
    if (destino && destino !== aqui) router.replace(destino, { scroll: false });
    else router.refresh();
  };
}

export const ID_ACCION_PAGO = 'pago-accion';

/** Bloque numerado de la página de pago (Moneda, Método, Paga). */
export function BloquePago({
  numero,
  titulo,
  id,
  children,
  className,
}: {
  numero?: number;
  titulo: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const idTitulo = useId();
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      className={clsx(
        'grid scroll-mt-24 gap-4 rounded-3xl border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5 sm:p-5.5',
        className,
      )}
    >
      <h2 id={idTitulo} className="flex items-center gap-2.5 text-[1.15rem]">
        {numero !== undefined && (
          <em className="grid size-6.5 shrink-0 place-items-center rounded-full border border-cian font-titulo text-xs font-bold text-cian not-italic">
            {numero}
          </em>
        )}
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function MensajeError({ error, extra }: { error: ErrorLlamada; extra?: string }) {
  return (
    <p
      role="alert"
      className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
      <span>
        {error.mensaje}
        {extra ? ` ${extra}` : ''}
      </span>
    </p>
  );
}

/** Copia al portapapeles con respaldo para navegadores sin permiso. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const notificar = useNotificar();
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${etiqueta}`}
      onClick={async () => {
        if (!(await copiarTexto(texto))) {
          return notificar('No se pudo copiar. Mantén presionado el dato para copiarlo.', 'error');
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1400);
      }}
      className={clsx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[0.625rem] border px-3 text-[0.8rem] font-semibold transition-colors',
        copiado
          ? 'border-exito text-exito'
          : 'border-borde-fuerte bg-white/[0.03] hover:border-cian',
      )}
    >
      {copiado ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

/**
 * Las instrucciones del método son texto libre del panel. Solo se parten en
 * filas copiables si cada línea es «Etiqueta: valor»; si no, se muestran tal
 * cual con un solo botón de copiar.
 */
export function partirInstrucciones(texto: string): [string, string][] | null {
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length < 2) return null;
  const filas: [string, string][] = [];
  for (const l of lineas) {
    // «Etiqueta: valor», con una etiqueta corta sin puntuación de frase y un solo dato.
    const m = /^([^:.·]{1,30}):\s+([^:]+)$/.exec(l);
    if (!m?.[1] || !m[2]) return null;
    filas.push([m[1].trim(), m[2].trim()]);
  }
  return filas;
}

/** Importe tal como se escribe en el banco: sin símbolo ni separador de miles. */
function montoParaCopiar(total: string, moneda: Moneda) {
  const info = INFO_MONEDA[moneda];
  return new Intl.NumberFormat(info.region, {
    useGrouping: false,
    minimumFractionDigits: info.decimales,
    maximumFractionDigits: 2,
  }).format(Number(total));
}

/* ───────────────────────────── Paga: saldo ───────────────────────────── */

function AccionSaldo({
  facturaId,
  totalUsd,
  saldoUsd,
}: {
  facturaId: string;
  totalUsd: string;
  saldoUsd: string;
}) {
  const actualizar = useActualizarPago();
  const notificar = useNotificar();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const queda = (Number(saldoUsd) - Number(totalUsd)).toFixed(2);

  async function pagar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/pagar-con-saldo`);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar('Factura pagada con tu saldo.', 'exito');
    actualizar();
  }

  return (
    <div className="grid gap-4">
      <dl className="grid gap-1.5 rounded-2xl border border-borde-fuerte bg-hundida/60 p-3.5 text-sm tabular-nums">
        <div className="flex justify-between gap-3 text-tinta-suave">
          <dt>Tu saldo</dt>
          <dd>{formatearMonto(saldoUsd, 'USD')}</dd>
        </div>
        <div className="flex justify-between gap-3 text-tinta-suave">
          <dt>Esta factura</dt>
          <dd>−{formatearMonto(totalUsd, 'USD')}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-borde pt-1.5 font-semibold">
          <dt>Te queda</dt>
          <dd>{formatearMonto(queda, 'USD')}</dd>
        </div>
      </dl>
      {error && <MensajeError error={error} />}
      <div className="grid gap-2">
        <Boton
          tamano="lg"
          className="w-full"
          cargando={cargando}
          icono={<Wallet className="size-4" aria-hidden="true" />}
          onClick={() => void pagar()}
        >
          {cargando ? 'Pagando…' : `Pagar ${formatearMonto(totalUsd, 'USD')} con mi saldo`}
        </Boton>
        <p className="text-center text-xs text-tinta-tenue">
          La factura queda pagada al momento y tu plan se activa.
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────── Paga: con comprobante ──────────────────────── */

const TIPOS_COMPROBANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PATRON_REFERENCIA = /^[\w\s#./-]+$/;
const DIA_MS = 24 * 3600_000;

function hoyLocal(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * DIA_MS);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** «1.125,50», «1125,5» o «1125.50» → «1125.50»; null si no es un importe. */
export function normalizarMonto(texto: string): string | null {
  let s = texto.replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  return /^\d{1,12}(\.\d{1,2})?$/.test(s) ? s : null;
}

const pesoTexto = (b: number) =>
  b >= 1048576
    ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;

type Estado = 'ok' | 'aviso' | 'mal' | '';
type Validacion = [Estado, string];

function Mensaje({ id, estado, texto }: { id: string; estado: Estado; texto: string }) {
  if (!texto) return null;
  return (
    <p
      id={id}
      className={clsx(
        'flex items-center gap-1.5 text-xs',
        estado === 'ok' && 'text-exito',
        estado === 'aviso' && 'text-aviso',
        estado === 'mal' && 'font-medium text-peligro',
        estado === '' && 'text-tinta-tenue',
      )}
    >
      {estado === 'ok' && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
      {estado === 'mal' && <X className="size-3.5 shrink-0" aria-hidden="true" />}
      {estado === 'aviso' && <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
      {texto}
    </p>
  );
}

const claseEntrada = (estado: Estado) =>
  clsx(
    'h-12 w-full min-w-0 rounded-xl border bg-hundida px-3.5 text-[0.95rem] text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus-visible:border-cian [color-scheme:dark]',
    estado === 'mal' && 'border-peligro',
    estado === 'aviso' && 'border-aviso/70',
    estado === 'ok' && 'border-exito/70',
    estado === '' && 'border-borde-fuerte',
  );

function FormularioComprobante({
  facturaId,
  total,
  moneda,
  metodo,
  maxMb,
}: {
  facturaId: string;
  total: string;
  moneda: Moneda;
  metodo: MetodoCobroPublico;
  maxMb: number;
}) {
  const actualizar = useActualizarPago();
  const notificar = useNotificar();
  const id = useId();
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoyLocal);
  const [referencia, setReferencia] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const [encima, setEncima] = useState(false);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const servidor = erroresPorCampo(error);
  const totalTexto = formatearMonto(total, moneda);

  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  const validar: Record<'monto' | 'fecha' | 'referencia' | 'archivo', () => Validacion> = {
    monto: () => {
      if (servidor.monto) return ['mal', servidor.monto];
      if (!monto.trim()) return ['mal', 'Escribe el monto que pagaste.'];
      const n = normalizarMonto(monto);
      if (!n) return ['mal', `Usa solo números con hasta 2 decimales, por ejemplo ${total}.`];
      if (Number(n) <= 0) return ['mal', 'Debe ser mayor que cero.'];
      if (Number(n) + 0.005 < Number(total)) {
        return [
          'aviso',
          `Es menos que el total (${totalTexto}). Si falta dinero, el pago puede ser rechazado.`,
        ];
      }
      return ['ok', Number(n) === Number(total) ? 'Coincide con la factura' : 'Monto listo'];
    },
    fecha: () => {
      if (servidor.fechaPago) return ['mal', servidor.fechaPago];
      if (!fecha) return ['mal', 'Elige la fecha del pago.'];
      if (fecha > hoyLocal()) return ['mal', 'La fecha no puede ser futura.'];
      if (fecha < hoyLocal(-90)) {
        return ['mal', 'Tiene más de 90 días. Escríbenos desde Soporte para registrarlo.'];
      }
      return ['ok', 'Fecha lista'];
    },
    referencia: () => {
      if (servidor.referenciaExterna) return ['mal', servidor.referenciaExterna];
      const r = referencia.trim();
      if (!r) {
        return metodo.requiereReferencia
          ? ['mal', 'Escribe el número de referencia del pago.']
          : ['', 'Opcional. Lo ves en el recibo de tu banco.'];
      }
      if (r.length > 80 || !PATRON_REFERENCIA.test(r)) {
        return ['mal', 'Usa letras, números, espacios y # . / - (hasta 80).'];
      }
      return ['ok', 'Referencia lista'];
    },
    archivo: () => {
      if (errorArchivo) return ['mal', errorArchivo];
      if (servidor.comprobante) return ['mal', servidor.comprobante];
      if (!archivo) return ['mal', 'Adjunta la captura o el PDF del pago.'];
      return ['ok', ''];
    },
  };

  /** Lo que se muestra: el error solo después de tocar el campo o de intentar enviar. */
  function mostrar(campo: keyof typeof validar, ayuda = ''): Validacion {
    const [estado, texto] = validar[campo]();
    const visible = intento || tocados[campo] || (estado !== 'mal' && estado !== '');
    if (!visible) return ['', ayuda];
    return estado === '' ? ['', texto || ayuda] : [estado, texto];
  }
  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  const limpiarServidor = () => setError(null);

  function tomarArchivo(f: File | undefined) {
    if (!f) return;
    limpiarServidor();
    tocar('archivo');
    if (!TIPOS_COMPROBANTE.includes(f.type)) {
      return setErrorArchivo('Ese archivo no sirve. Sube una imagen JPG, PNG o WEBP, o un PDF.');
    }
    if (f.size > maxMb * 1048576) {
      return setErrorArchivo(`El archivo pesa ${pesoTexto(f.size)}. El máximo es ${maxMb} MB.`);
    }
    setErrorArchivo('');
    setArchivo(f);
    setVista(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
  }

  function quitarArchivo() {
    setArchivo(null);
    setVista('');
    setErrorArchivo('');
    if (entradaArchivo.current) entradaArchivo.current.value = '';
  }

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setEncima(false);
    tomarArchivo(e.dataTransfer.files[0]);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    const malos = (['monto', 'fecha', 'referencia', 'archivo'] as const).filter(
      (c) => validar[c]()[0] === 'mal',
    );
    if (malos.length > 0) {
      const primero = e.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]');
      primero?.focus();
      return;
    }
    const datos = new FormData();
    datos.set('metodoCobroId', metodo.id);
    datos.set('monto', normalizarMonto(monto) ?? monto);
    datos.set('fechaPago', fecha);
    if (referencia.trim()) datos.set('referenciaExterna', referencia.trim());
    datos.set('comprobante', archivo as File);
    setCargando(true);
    setError(null);
    const r = await llamarApi<PagoPublico>('POST', `/mi/facturas/${facturaId}/pagos`, datos);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar(`Comprobante enviado. Tu código es ${r.datos.referencia}.`, 'exito');
    actualizar();
  }

  const [eMonto, tMonto] = mostrar('monto', 'Tal como aparece en tu comprobante.');
  const [eFecha, tFecha] = mostrar('fecha');
  const [eRef, tRef] = mostrar(
    'referencia',
    metodo.requiereReferencia
      ? 'Lo ves en el recibo de tu banco.'
      : 'Opcional. Lo ves en el recibo de tu banco.',
  );
  const [eArchivo, tArchivo] = intento || tocados.archivo ? validar.archivo() : ['', ''];
  const cantidadMalos = intento
    ? (['monto', 'fecha', 'referencia', 'archivo'] as const).filter(
        (c) => validar[c]()[0] === 'mal',
      ).length
    : 0;
  const deCampo = ['monto', 'fechaPago', 'referenciaExterna', 'comprobante'].some(
    (c) => servidor[c],
  );
  const otroError = error && !deCampo ? error : null;

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4" aria-label="Enviar comprobante">
      <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
        Paso 2 · Cuéntanos cómo pagaste
      </span>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-monto`} className="text-sm font-semibold">
            Monto que pagaste ({moneda})
          </label>
          <input
            id={`${id}-monto`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={total}
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value);
              limpiarServidor();
            }}
            onBlur={() => tocar('monto')}
            aria-invalid={eMonto === 'mal' ? true : undefined}
            aria-describedby={`${id}-monto-m`}
            className={claseEntrada(eMonto)}
          />
          <Mensaje id={`${id}-monto-m`} estado={eMonto} texto={tMonto} />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`${id}-fecha`} className="text-sm font-semibold">
            Fecha del pago
          </label>
          <input
            id={`${id}-fecha`}
            type="date"
            max={hoyLocal()}
            min={hoyLocal(-90)}
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              tocar('fecha');
              limpiarServidor();
            }}
            aria-invalid={eFecha === 'mal' ? true : undefined}
            aria-describedby={`${id}-fecha-m`}
            className={claseEntrada(eFecha)}
          />
          <Mensaje id={`${id}-fecha-m`} estado={eFecha} texto={tFecha} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-ref`} className="text-sm font-semibold">
          {metodo.requiereReferencia ? 'Número de referencia' : 'Referencia (opcional)'}
        </label>
        <input
          id={`${id}-ref`}
          autoComplete="off"
          maxLength={80}
          placeholder="Ej.: 00123456"
          value={referencia}
          onChange={(e) => {
            setReferencia(e.target.value);
            limpiarServidor();
          }}
          onBlur={() => tocar('referencia')}
          aria-invalid={eRef === 'mal' ? true : undefined}
          aria-describedby={`${id}-ref-m`}
          className={claseEntrada(eRef)}
        />
        <Mensaje id={`${id}-ref-m`} estado={eRef} texto={tRef} />
      </div>

      <div className="grid gap-1.5">
        <span id={`${id}-comp`} className="text-sm font-semibold">
          Comprobante
        </span>
        {archivo ? (
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-exito/45 bg-exito-suave p-2.5">
            <span className="grid size-14 place-items-center overflow-hidden rounded-[0.625rem] bg-hundida text-tinta-suave">
              {vista ? (
                // Vista previa local (objeto del navegador): next/image no aplica.
                <img
                  src={vista}
                  alt="Vista previa del comprobante"
                  className="size-full object-cover"
                />
              ) : (
                <FileText className="size-6" aria-hidden="true" />
              )}
            </span>
            <span className="grid min-w-0">
              <b className="truncate text-sm" title={archivo.name}>
                {archivo.name}
              </b>
              <span className="text-xs text-tinta-suave">
                {pesoTexto(archivo.size)} · listo para enviar
              </span>
            </span>
            <button
              type="button"
              onClick={quitarArchivo}
              className="px-1 text-sm font-medium text-peligro hover:underline"
            >
              Quitar
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(true);
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={soltar}
            className={clsx(
              'relative grid cursor-pointer justify-items-center gap-1 rounded-2xl border-[1.5px] border-dashed px-3.5 py-5 text-center transition-colors focus-within:border-cian',
              encima ? 'border-cian bg-cian/[0.06]' : 'bg-hundida/60 hover:border-cian',
              !encima && (eArchivo === 'mal' ? 'border-peligro' : 'border-borde-fuerte'),
            )}
          >
            <input
              ref={entradaArchivo}
              type="file"
              accept={TIPOS_COMPROBANTE.join(',')}
              aria-labelledby={`${id}-comp`}
              aria-describedby={`${id}-comp-m ${id}-comp-a`}
              aria-invalid={eArchivo === 'mal' ? true : undefined}
              onChange={(e) => tomarArchivo(e.target.files?.[0])}
              className="absolute size-px opacity-0"
            />
            <Upload className="size-6 text-cian" aria-hidden="true" />
            <b className="text-sm">Toca para subir la captura</b>
            <span id={`${id}-comp-a`} className="text-xs text-tinta-suave">
              o arrástrala aquí · JPG, PNG, WEBP o PDF · hasta {maxMb} MB
            </span>
          </label>
        )}
        <Mensaje id={`${id}-comp-m`} estado={eArchivo as Estado} texto={tArchivo as string} />
      </div>

      {cantidadMalos > 0 && (
        <p role="alert" className="text-sm font-medium text-peligro">
          {cantidadMalos === 1
            ? 'Revisa el campo marcado en rojo.'
            : `Revisa los ${cantidadMalos} campos marcados en rojo.`}
        </p>
      )}
      {otroError && <MensajeError error={otroError} />}
      <div className="grid gap-2">
        <Boton
          type="submit"
          tamano="lg"
          className="w-full"
          cargando={cargando}
          icono={<Send className="size-4" aria-hidden="true" />}
        >
          {cargando ? 'Enviando comprobante…' : 'Enviar comprobante'}
        </Boton>
        <p className="text-center text-xs text-tinta-tenue">
          El equipo lo revisa y te avisamos por correo cuando se confirme.
        </p>
      </div>
    </form>
  );
}

function AccionComprobante({
  facturaId,
  total,
  moneda,
  metodo,
  maxMb,
}: {
  facturaId: string;
  total: string;
  moneda: Moneda;
  metodo: MetodoCobroPublico;
  maxMb: number;
}) {
  const filas = partirInstrucciones(metodo.instrucciones);
  const monto = montoParaCopiar(total, moneda);
  const todo = [
    ...(filas ? filas.map(([e, v]) => `${e}: ${v}`) : [metodo.instrucciones.trim()]),
    `Monto: ${monto} ${moneda}`,
  ].join('\n');

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
          Paso 1 · Paga con estos datos
        </span>
        <div className="grid overflow-hidden rounded-2xl border border-borde-fuerte bg-hundida/70">
          {filas ? (
            filas.map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-borde px-3.5 py-2.5"
              >
                <span className="grid min-w-0">
                  <span className="text-xs text-tinta-suave">{etiqueta}</span>
                  <b className="font-semibold break-words tabular-nums">{valor}</b>
                </span>
                <BotonCopiar texto={valor} etiqueta={etiqueta.toLowerCase()} />
              </div>
            ))
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 border-b border-borde px-3.5 py-3">
              <p className="text-sm break-words whitespace-pre-line">{metodo.instrucciones}</p>
              <BotonCopiar texto={metodo.instrucciones.trim()} etiqueta="los datos" />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2.5">
            <span className="grid min-w-0">
              <span className="text-xs text-tinta-suave">Monto exacto</span>
              <b className="font-titulo text-xl font-extrabold tabular-nums">
                {formatearMonto(total, moneda)}
              </b>
            </span>
            <BotonCopiar texto={monto} etiqueta="monto exacto" />
          </div>
          {filas && filas.length > 1 && (
            <div className="flex justify-end border-t border-borde bg-marca-suave/40 px-3.5 py-2">
              <CopiarTodo texto={todo} />
            </div>
          )}
        </div>
      </div>
      <FormularioComprobante
        facturaId={facturaId}
        total={total}
        moneda={moneda}
        metodo={metodo}
        maxMb={maxMb}
      />
    </div>
  );
}

function CopiarTodo({ texto }: { texto: string }) {
  const notificar = useNotificar();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copiarTexto(texto);
        notificar(
          ok
            ? 'Copiamos todos los datos.'
            : 'No se pudo copiar. Mantén presionado el dato para copiarlo.',
          ok ? 'exito' : 'error',
        );
      }}
      className="text-sm font-medium text-cian hover:underline"
    >
      Copiar todos los datos
    </button>
  );
}

/* ─────────────────────────── elegir y pagar ─────────────────────────── */

export interface FacturaParaPagar {
  id: string;
  numero: string;
  moneda: Moneda;
  total: string;
  totalUsd: string;
  /** Servicio y plan, para la barra del teléfono. */
  nombre: string;
}

type Metodo = { tipo: 'saldo' } | { tipo: 'linea'; id: string } | { tipo: 'manual'; id: string };

const claveMetodo = (m: Metodo) => (m.tipo === 'saldo' ? 'saldo' : `${m.tipo}:${m.id}`);

function Velocidad({ ya }: { ya: boolean }) {
  return (
    <span
      className={clsx(
        'ml-1.5 inline-block rounded-full border px-1.5 py-px align-[1px] text-[0.62rem] font-bold tracking-[0.06em] whitespace-nowrap uppercase',
        ya ? 'border-exito/30 bg-exito-suave text-exito' : 'border-cian/30 bg-cian/10 text-cian',
      )}
    >
      {ya ? 'Al instante' : 'Revisión del equipo'}
    </span>
  );
}

function OpcionMetodo({
  nombre,
  ya,
  descripcion,
  icono,
  color,
  elegido,
  deshabilitado,
  onElegir,
}: {
  nombre: string;
  ya: boolean;
  descripcion: ReactNode;
  icono: ReactNode;
  color: string;
  elegido: boolean;
  deshabilitado?: boolean;
  onElegir: () => void;
}) {
  return (
    <label
      className={clsx(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors',
        elegido
          ? 'border-marca bg-marca-suave shadow-[inset_0_0_0_1px_var(--nv-marca)]'
          : 'border-borde-fuerte bg-hundida/50 hover:border-marca/60',
        deshabilitado && 'cursor-not-allowed opacity-55',
      )}
    >
      <span
        className="grid size-10 place-items-center rounded-full border border-white/10 text-[color:var(--c)] [background:radial-gradient(circle,color-mix(in_srgb,var(--c)_30%,transparent),transparent_70%)]"
        style={{ '--c': color } as CSSProperties}
        aria-hidden="true"
      >
        {icono}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <b className="text-[0.92rem] font-semibold">
          {nombre}
          <Velocidad ya={ya} />
        </b>
        <span className="text-[0.8rem] text-tinta-suave">{descripcion}</span>
      </span>
      <input
        type="radio"
        name="metodo-pago"
        checked={elegido}
        disabled={deshabilitado}
        onChange={onElegir}
        className="grid size-5 shrink-0 appearance-none place-items-center rounded-full border-2 border-borde-fuerte transition-[border] checked:border-[6px] checked:border-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cian disabled:cursor-not-allowed"
      />
    </label>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
        {titulo}
      </span>
      {children}
    </div>
  );
}

/** Moneda de la factura: se recalcula en la API con la tasa de hoy. */
function MonedaFactura({
  facturaId,
  actual,
  monedas,
  hayEnLinea,
}: {
  facturaId: string;
  actual: Moneda;
  monedas: readonly Moneda[];
  hayEnLinea: boolean;
}) {
  const actualizar = useActualizarPago();
  const notificar = useNotificar();
  const [cambiando, setCambiando] = useState<Moneda | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function cambiar(m: Moneda) {
    if (m === actual || cambiando) return;
    setCambiando(m);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/recotizar`, { moneda: m });
    setCambiando(null);
    if (!r.ok) return setError(r.error);
    notificar(`Factura en ${INFO_MONEDA[m].nombre.toLowerCase()}. Importe actualizado.`, 'exito');
    actualizar();
  }

  return (
    <BloquePago numero={1} titulo="Moneda de la factura">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Moneda de la factura">
        {monedas.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === actual}
            disabled={cambiando !== null}
            onClick={() => void cambiar(m)}
            className={clsx(
              'chip inline-flex items-center gap-2',
              m === actual && 'shadow-[0_0_0_1.5px_var(--nv-marca)]',
            )}
            title={INFO_MONEDA[m].nombre}
          >
            {cambiando === m ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Bandera moneda={m} decorativa />
            )}
            {m}
          </button>
        ))}
      </div>
      <p role="status" className="text-sm text-tinta-suave">
        {cambiando
          ? `Cambiando a ${INFO_MONEDA[cambiando].nombre.toLowerCase()}…`
          : hayEnLinea
            ? 'Cambiarla actualiza el importe con la tasa de hoy.'
            : 'En esta moneda no hay pago en línea: paga con tu saldo o con comprobante. Cambiarla actualiza el importe con la tasa de hoy.'}
      </p>
      {error && <MensajeError error={error} extra="Recarga la página e inténtalo de nuevo." />}
    </BloquePago>
  );
}

/**
 * Moneda, método y acción de pago de una factura por pagar, con la barra del
 * teléfono. Los métodos salen del panel (manuales) y de la API de pagos en
 * línea; nada de nombres ni datos fijos aquí.
 */
export function ElegirPago({
  factura,
  monedas,
  saldoUsd,
  enLinea,
  manuales,
  maxMb,
  volver,
}: {
  factura: FacturaParaPagar;
  /** Dirección de esta factura en la página actual. */
  volver: string;
  /** null: la factura no se puede recalcular en otra moneda. */
  monedas: readonly Moneda[] | null;
  /** null: la billetera no está disponible para esta cuenta. */
  saldoUsd: string | null;
  enLinea: OpcionesPagoEnLinea | null;
  manuales: MetodoCobroPublico[];
  maxMb: number;
}) {
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [accionVisible, setAccionVisible] = useState(false);
  const alcanza = saldoUsd !== null && Number(saldoUsd) >= Number(factura.totalUsd);
  const opciones = enLinea?.opciones ?? [];
  const opcionLinea =
    metodo?.tipo === 'linea' ? opciones.find((o) => o.metodoCobroId === metodo.id) : undefined;
  const manual = metodo?.tipo === 'manual' ? manuales.find((m) => m.id === metodo.id) : undefined;
  const clave = metodo ? claveMetodo(metodo) : null;
  const hayMetodos = saldoUsd !== null || opciones.length > 0 || manuales.length > 0;

  useEffect(() => {
    const el = document.getElementById(ID_ACCION_PAGO);
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setAccionVisible(Boolean(e?.isIntersecting)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function elegir(m: Metodo) {
    setMetodo(m);
    // En el teléfono el bloque de acción queda debajo: se lleva a la vista.
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      setTimeout(
        () =>
          document
            .getElementById(ID_ACCION_PAGO)
            ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
        60,
      );
    }
  }

  let tituloAccion = 'Paga';
  let cuerpoAccion: ReactNode = (
    <p className="flex items-start gap-2.5 rounded-xl border border-borde bg-marca-suave/60 px-3.5 py-3 text-sm text-tinta-suave">
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-cian" aria-hidden="true" />
      Elige un método arriba y aquí te mostramos cómo pagar.
    </p>
  );
  if (metodo?.tipo === 'saldo' && saldoUsd !== null && alcanza) {
    tituloAccion = 'Paga con tu saldo';
    cuerpoAccion = (
      <AccionSaldo facturaId={factura.id} totalUsd={factura.totalUsd} saldoUsd={saldoUsd} />
    );
  } else if (opcionLinea && enLinea) {
    tituloAccion = `Paga con ${opcionLinea.nombre}`;
    cuerpoAccion = (
      <AccionPagoEnLinea key={opcionLinea.metodoCobroId} datos={enLinea} opcion={opcionLinea} />
    );
  } else if (manual) {
    tituloAccion = 'Paga y envía tu comprobante';
    cuerpoAccion = (
      <AccionComprobante
        key={manual.id}
        facturaId={factura.id}
        total={factura.total}
        moneda={factura.moneda}
        metodo={manual}
        maxMb={maxMb}
      />
    );
  }

  return (
    <VolverA.Provider value={volver}>
      {monedas && monedas.length > 1 && (
        <MonedaFactura
          facturaId={factura.id}
          actual={factura.moneda}
          monedas={monedas}
          hayEnLinea={opciones.length > 0}
        />
      )}

      <BloquePago numero={monedas && monedas.length > 1 ? 2 : 1} titulo="¿Cómo vas a pagar?">
        {hayMetodos ? (
          <div role="radiogroup" aria-label="Método de pago" className="grid gap-3">
            {(saldoUsd !== null || opciones.length > 0) && (
              <Grupo titulo="Al instante">
                {saldoUsd !== null && (
                  <OpcionMetodo
                    nombre="Saldo NV"
                    ya
                    icono={<Wallet className="size-4.5" />}
                    color="#a855f7"
                    elegido={clave === 'saldo'}
                    deshabilitado={!alcanza}
                    onElegir={() => elegir({ tipo: 'saldo' })}
                    descripcion={
                      alcanza ? (
                        `Tienes ${formatearMonto(saldoUsd, 'USD')} disponibles`
                      ) : (
                        <>
                          Tienes {formatearMonto(saldoUsd, 'USD')} ·{' '}
                          <span className="text-aviso">
                            te faltan{' '}
                            {formatearMonto(
                              (Number(factura.totalUsd) - Number(saldoUsd)).toFixed(2),
                              'USD',
                            )}
                          </span>
                        </>
                      )
                    }
                  />
                )}
                {opciones.map((o) => (
                  <OpcionMetodo
                    key={o.metodoCobroId}
                    nombre={o.nombre}
                    ya
                    icono={<Globe className="size-4.5" />}
                    color="#3b82f6"
                    elegido={clave === `linea:${o.metodoCobroId}`}
                    onElegir={() => elegir({ tipo: 'linea', id: o.metodoCobroId })}
                    descripcion={`${nombrePasarela(o.pasarela)} · ${o.moneda}`}
                  />
                ))}
              </Grupo>
            )}
            {manuales.length > 0 && (
              <Grupo titulo="Con comprobante">
                {manuales.map((m) => (
                  <OpcionMetodo
                    key={m.id}
                    nombre={m.nombre}
                    ya={false}
                    icono={<Landmark className="size-4.5" />}
                    color="#22d3ee"
                    elegido={clave === `manual:${m.id}`}
                    onElegir={() => elegir({ tipo: 'manual', id: m.id })}
                    descripcion={
                      m.requiereReferencia
                        ? 'Pagas y nos envías el comprobante con la referencia'
                        : 'Pagas y nos envías el comprobante'
                    }
                  />
                ))}
              </Grupo>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-aviso/35 bg-aviso-suave px-3.5 py-3 text-sm">
            Por ahora no hay formas de pago en {factura.moneda}.{' '}
            {monedas && monedas.length > 1
              ? 'Elige otra moneda arriba o escríbenos desde Soporte.'
              : 'Escríbenos desde Soporte y te ayudamos.'}
          </p>
        )}
      </BloquePago>

      <BloquePago
        numero={monedas && monedas.length > 1 ? 3 : 2}
        titulo={tituloAccion}
        id={ID_ACCION_PAGO}
      >
        {cuerpoAccion}
      </BloquePago>

      {/* Barra del teléfono: total y un atajo al bloque de pago. */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-30 border-t border-borde-fuerte bg-fondo/92 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md transition-transform duration-200 lg:hidden',
          accionVisible && 'translate-y-full',
        )}
        aria-hidden={accionVisible || undefined}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <span className="grid min-w-0">
            <span className="truncate text-xs text-tinta-suave">{factura.nombre}</span>
            <b className="font-titulo text-lg tabular-nums">
              {formatearMonto(factura.total, factura.moneda)}
            </b>
          </span>
          <Boton
            tamano="md"
            tabIndex={accionVisible ? -1 : undefined}
            onClick={() =>
              document
                .getElementById(ID_ACCION_PAGO)
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }
          >
            {metodo ? 'Pagar' : 'Elegir método'}
          </Boton>
        </div>
      </div>
    </VolverA.Provider>
  );
}

/* ─────────────────────── acciones del pedido ─────────────────────── */

/** Paga con saldo todas las facturas pendientes del pedido (POST /mi/pedidos/:id/pagar). */
export function PagarPedidoConSaldo({
  pedidoId,
  pendientes,
  pendienteUsd,
  saldoUsd,
}: {
  pedidoId: string;
  pendientes: number;
  pendienteUsd: string;
  saldoUsd: string;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function pagar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/pedidos/${pedidoId}/pagar`);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar('Pedido pagado con tu saldo.', 'exito');
    router.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section
      aria-label="Pagar todo con tu saldo"
      className="grid gap-3 rounded-[1.25rem] border border-violeta/45 bg-[radial-gradient(80%_120%_at_0%_50%,rgb(168_85_247/0.18),transparent_70%),rgb(8_11_26/0.7)] p-4"
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full border border-violeta/50 bg-violeta/15 text-violeta"
          aria-hidden="true"
        >
          <Wallet className="size-5" />
        </span>
        <span className="grid min-w-0 flex-[1_1_14rem] gap-0.5">
          <b>Tu saldo alcanza para todo el pedido</b>
          <span className="text-sm text-tinta-suave">
            Pagas las {pendientes} facturas de una vez: {formatearMonto(pendienteUsd, 'USD')} de{' '}
            {formatearMonto(saldoUsd, 'USD')}.
          </span>
        </span>
        <Boton cargando={cargando} onClick={() => void pagar()} className="max-sm:w-full">
          {cargando ? 'Pagando…' : 'Pagar todo con mi saldo'}
        </Boton>
      </div>
      {error && <MensajeError error={error} extra="Recarga la página para ver cómo quedó." />}
    </section>
  );
}

/** Factura vencida: se actualiza con la tasa de hoy (y un plazo nuevo) antes de pagarla. */
export function ActualizarImporte({
  facturaId,
  moneda,
  volver,
}: {
  facturaId: string;
  moneda: Moneda;
  volver: string;
}) {
  const actualizarPagina = useActualizarPago();
  const notificar = useNotificar();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function actualizar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/recotizar`, { moneda });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar('Importe actualizado con la tasa de hoy.', 'exito');
    actualizarPagina(volver);
  }

  return (
    <div className="grid gap-3">
      <Boton
        cargando={cargando}
        onClick={() => void actualizar()}
        className="justify-self-start max-sm:w-full"
      >
        {cargando ? 'Actualizando…' : 'Actualizar importe'}
      </Boton>
      {error && <MensajeError error={error} extra="Si sigue fallando, escríbenos desde Soporte." />}
    </div>
  );
}

/** Cancelar el pedido pendiente, con confirmación. */
export function CancelarPedido({ pedidoId, numero }: { pedidoId: string; numero: string }) {
  const router = useRouter();
  const notificar = useNotificar();
  const [confirmar, setConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function cancelar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/pedidos/${pedidoId}/cancelar`);
    setCargando(false);
    setConfirmar(false);
    if (!r.ok) return setError(r.error);
    notificar(`Cancelamos el pedido ${numero}.`, 'exito');
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      {confirmar ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>¿Seguro? Se anulan sus facturas.</span>
          <Boton variante="peligro" tamano="sm" cargando={cargando} onClick={() => void cancelar()}>
            {cargando ? 'Cancelando…' : 'Sí, cancelar'}
          </Boton>
          <Boton
            variante="fantasma"
            tamano="sm"
            disabled={cargando}
            onClick={() => setConfirmar(false)}
          >
            No
          </Boton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="justify-self-start py-1 text-sm font-medium text-peligro hover:underline"
        >
          Cancelar el pedido
        </button>
      )}
      {error && <MensajeError error={error} />}
    </div>
  );
}
