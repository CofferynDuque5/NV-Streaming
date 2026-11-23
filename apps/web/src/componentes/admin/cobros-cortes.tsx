'use client';

import {
  type CredencialesCuenta,
  generarClave,
  generarPin,
  MESES_RENOVACION_RAPIDA,
  type MetodoCobroPublico,
  type SuscripcionConLugar,
  TEXTOS_PLATAFORMA,
} from '@nv/shared';
import clsx from 'clsx';
import {
  CalendarCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Scissors,
  MessageCircle,
  Search,
  Send,
  Trash2,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { etiquetaDia, formatearFecha, formatearHora } from '@/lib/formato';
import { Dialogo, Opcion } from './cuentas-gestor';

type Seccion = 'vencimientos' | 'cortes';
type Filtro = 'todos' | 'hoy' | 'manana' | 'ayer' | 'semana' | 'antiguos';

/** Filtros rápidos, como en el Gestor. */
const FILTROS: Record<Seccion, [Filtro, string][]> = {
  vencimientos: [
    ['todos', 'Todos'],
    ['hoy', 'Hoy'],
    ['manana', 'Mañana'],
  ],
  cortes: [
    ['todos', 'Todos'],
    ['hoy', 'Hoy'],
    ['ayer', 'Ayer'],
    ['semana', '2 a 7 días'],
    ['antiguos', 'Más de 7 días'],
  ],
};

function pasa(f: Filtro, d: number) {
  switch (f) {
    case 'hoy':
      return d === 0;
    case 'manana':
      return d === -1;
    case 'ayer':
      return d === 1;
    case 'semana':
      return d >= 2 && d <= 7;
    case 'antiguos':
      return d > 7;
    default:
      return true;
  }
}

function cuando(seccion: Seccion, d: number): { texto: string; tono: string } {
  if (d === 0)
    return { texto: seccion === 'cortes' ? 'Venció hoy' : 'Vence hoy', tono: 'text-aviso' };
  if (d === -1) return { texto: 'Vence mañana', tono: 'text-cian' };
  if (d < -1) return { texto: `En ${-d} días`, tono: 'text-tinta-suave' };
  if (d === 1) return { texto: 'Venció ayer', tono: 'text-peligro' };
  return { texto: `Hace ${d} días`, tono: 'text-peligro' };
}

const sinTildes = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Suscripciones → Vencimientos (vencen hoy y mañana) y Cortes (ya vencidos que siguen
 * ocupando un perfil o cupo), como en el Gestor: buscador, filtros rápidos,
 * agrupado por plataforma y acciones por fila.
 */
export function ListaVencimientosCortes({
  seccion,
  lista,
  horaCorte,
  pasoHoraCorte,
  puedeCortar,
  puedeRevelar = false,
  puedeRenovar = false,
}: {
  seccion: Seccion;
  lista: SuscripcionConLugar[];
  horaCorte: number;
  pasoHoraCorte: boolean;
  puedeCortar: boolean;
  /** Con `cuentas.revelar`: «Ver datos» de la cuenta y el perfil al cortar. */
  puedeRevelar?: boolean;
  /** Con `pagos.gestionar`: «Renovar» con la factura pagada en el mismo paso. */
  puedeRenovar?: boolean;
}) {
  const [metodos, setMetodos] = useState<MetodoCobroPublico[] | null>(null);
  // Los métodos de cobro se piden una vez, al abrir el primer «Renovar».
  const pedirMetodos = useCallback(async () => {
    if (metodos) return metodos;
    const r = await llamarApi<MetodoCobroPublico[]>('GET', '/pagos/metodos');
    const lista = r.ok ? r.datos : [];
    setMetodos(lista);
    return lista;
  }, [metodos]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const hora = `${horaCorte > 12 ? horaCorte - 12 : horaCorte}:00 ${horaCorte >= 12 ? 'PM' : 'AM'}`;

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return lista.filter(
      (s) =>
        pasa(filtro, s.diasVencida) &&
        (!q ||
          sinTildes(
            [s.cliente.nombre, s.plan.servicio, s.plan.nombre, s.lugar?.etiqueta ?? '']
              .concat(s.lugar?.pistaCuenta ?? '')
              .join(' '),
          ).includes(q)),
    );
  }, [lista, filtro, busqueda]);

  const grupos = useMemo(() => {
    const m = new Map<string, SuscripcionConLugar[]>();
    for (const s of visibles) m.set(s.plan.servicio, [...(m.get(s.plan.servicio) ?? []), s]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [visibles]);

  return (
    <div className="grid gap-4">
      <Alerta tono="info">
        {seccion === 'vencimientos'
          ? pasoHoraCorte
            ? `Ya pasaron las ${hora} (hora de Venezuela): los que vencen hoy están en Cortes. Aquí quedan los de mañana.`
            : `Los que vencen hoy se quedan aquí hasta las ${hora} (hora de Venezuela); después pasan a Cortes.`
          : pasoHoraCorte
            ? `Vencidos que siguen ocupando un perfil o cupo, incluidos los que vencen hoy (ya pasaron las ${hora}).`
            : `Vencidos que siguen ocupando un perfil o cupo. Los que vencen hoy llegan a las ${hora} (hora de Venezuela).`}
      </Alerta>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            placeholder="Buscar cliente, plataforma, plan o cuenta"
            className="h-10 w-full rounded-xl border border-borde bg-hundida pr-3 pl-9 text-sm"
          />
        </label>
        <div role="group" aria-label="Filtrar" className="flex flex-wrap gap-1">
          {FILTROS[seccion].map(([f, texto]) => {
            const n = lista.filter((s) => pasa(f, s.diasVencida)).length;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={clsx(
                  'h-9 rounded-lg border px-3 text-sm',
                  filtro === f
                    ? 'border-cian bg-cian/10 text-tinta'
                    : 'border-borde text-tinta-suave hover:text-tinta',
                )}
              >
                {texto} <span className="tabular-nums text-tinta-tenue">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      {visibles.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={CalendarCheck}
            titulo={seccion === 'cortes' ? 'Sin cortes pendientes' : 'Nada vence hoy ni mañana'}
          >
            {lista.length > 0
              ? 'Nadie coincide con la búsqueda o el filtro.'
              : seccion === 'cortes'
                ? 'Nadie vencido sigue ocupando un perfil o cupo.'
                : 'No hay suscripciones que venzan hoy ni mañana.'}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        grupos.map(([servicio, filas]) => (
          <Tarjeta key={servicio}>
            <section aria-label={servicio}>
              <h3 className="border-b border-borde px-5 py-3 text-sm font-semibold sm:px-6">
                {servicio} · {filas.length}
              </h3>
              <ul className="divide-y divide-borde">
                {filas.map((s) => (
                  <Fila
                    key={s.id}
                    s={s}
                    seccion={seccion}
                    puedeCortar={puedeCortar}
                    puedeRevelar={puedeRevelar}
                    metodos={puedeRenovar ? pedirMetodos : null}
                    hermanos={
                      s.lugar
                        ? lista.filter(
                            (o) =>
                              o.id !== s.id &&
                              o.cliente.id === s.cliente.id &&
                              o.lugar?.cuentaId === s.lugar?.cuentaId,
                          ).length
                        : 0
                    }
                  />
                ))}
              </ul>
            </section>
          </Tarjeta>
        ))
      )}
    </div>
  );
}

function Fila({
  s,
  seccion,
  puedeCortar,
  puedeRevelar,
  metodos,
  hermanos,
}: {
  s: SuscripcionConLugar;
  seccion: Seccion;
  puedeCortar: boolean;
  puedeRevelar: boolean;
  /** Pide los métodos de cobro para «Renovar»; null = sin permiso de registrar pagos. */
  metodos: (() => Promise<MetodoCobroPublico[]>) | null;
  hermanos: number;
}) {
  const w = cuando(seccion, s.diasVencida);
  return (
    <li className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <Link
          href={`/admin/suscripciones/${s.id}`}
          className="font-medium hover:text-marca hover:underline"
        >
          {s.cliente.nombre}
        </Link>
        <p className="truncate text-sm text-tinta-suave">
          {s.plan.nombre}
          {s.lugar && (
            <>
              {' · '}
              {s.lugar.etiqueta}
              {s.lugar.pistaCuenta ? ` · ${s.lugar.pistaCuenta}` : ''}
            </>
          )}
          {hermanos > 0 && ` · +${hermanos} en la misma cuenta`}
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="grid text-right">
          <span className={w.tono}>{w.texto}</span>
          {s.venceEn && (
            <time dateTime={s.venceEn} className="text-xs text-tinta-tenue">
              {formatearFecha(s.venceEn)}
            </time>
          )}
        </span>
        <EstadoSuscripcionInsignia estado={s.estado} />
        {s.cobro && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-exito-suave px-2 py-0.5 text-xs font-semibold text-exito"
            title={`Cobrado ${cuandoCobro(s.cobro.en)}${s.cobro.por ? ` por ${s.cobro.por}` : ''}`}
          >
            <Check className="size-3" aria-hidden="true" />
            Cobrado {cuandoCobro(s.cobro.en)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link
          href={`/admin/suscripciones/${s.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borde-fuerte px-3 text-sm font-semibold hover:border-cian"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {s.facturaAbierta ? `Factura ${s.facturaAbierta.numero}` : 'Renovar'}
        </Link>
        {metodos && s.plan.renovable && <Renovar s={s} metodos={metodos} />}
        <Cobrar s={s} />
        {puedeCortar && s.lugar && <CambiarDatos s={s} />}
        {puedeCortar && s.lugar && seccion === 'cortes' && (
          <Cortar s={s} hermanos={hermanos} puedeRevelar={puedeRevelar} />
        )}
        {puedeCortar && s.lugar && seccion === 'cortes' && puedeEliminar(s) && <Eliminar s={s} />}
      </div>
    </li>
  );
}

/* ───────────────────────── Renovar ───────────────────────── */

type Plazo = { tipo: 'meses'; meses: number } | { tipo: 'otro' } | { tipo: 'fecha' };

function sumarMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/**
 * «Renovar» como en el Gestor: 1, 3, 6 o 12 meses, otro número de meses o
 * hasta una fecha. La factura queda pagada con el método elegido (Caja y
 * Balance) y la suscripción con su fecha nueva, en un solo paso.
 */
function Renovar({
  s,
  metodos,
}: {
  s: SuscripcionConLugar;
  metodos: () => Promise<MetodoCobroPublico[]>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [plazo, setPlazo] = useState<Plazo>({ tipo: 'meses', meses: 1 });
  const [otro, setOtro] = useState('2');
  const [fecha, setFecha] = useState('');
  const [lista, setLista] = useState<MetodoCobroPublico[] | null>(null);
  const [metodoId, setMetodoId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [listo, setListo] = useState<{
    numero: string;
    total: string;
    moneda: string;
    venceEn: string;
  } | null>(null);
  /** Momento en que se abrió el diálogo (para calcular la fecha nueva sin leer el reloj al pintar). */
  const [ahoraMs, setAhoraMs] = useState(0);
  const deMoneda = (lista ?? []).filter((m) => m.moneda === s.moneda);
  const metodo = deMoneda.find((m) => m.id === metodoId) ?? null;
  const campos = error ? erroresPorCampo(error) : {};

  async function abrir() {
    setAhoraMs(Date.now());
    setAbierto(true);
    setPlazo({ tipo: 'meses', meses: 1 });
    setFecha('');
    setReferencia('');
    setError(null);
    setListo(null);
    const m = await metodos();
    setLista(m);
    const propios = m.filter((x) => x.moneda === s.moneda);
    setMetodoId(propios.length === 1 ? propios[0]!.id : '');
  }

  function cerrar() {
    setAbierto(false);
    if (listo) router.refresh();
  }

  const meses = plazo.tipo === 'meses' ? plazo.meses : plazo.tipo === 'otro' ? Number(otro) : null;
  const base =
    s.venceEn && new Date(s.venceEn).getTime() > ahoraMs ? new Date(s.venceEn) : new Date(ahoraMs);
  const nueva =
    meses && Number.isInteger(meses) && meses > 0
      ? sumarMeses(base, meses).toISOString()
      : plazo.tipo === 'fecha' && fecha
        ? new Date(`${fecha}T16:00:00Z`).toISOString()
        : null;

  async function confirmar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<{
      factura: { numero: string; total: string; moneda: string };
      venceEn: string;
    }>('POST', `/suscripciones/${s.id}/renovar-pagada`, {
      ...(plazo.tipo === 'fecha' ? { venceEn: fecha } : { meses }),
      metodoCobroId: metodoId,
      ...(referencia.trim() ? { referenciaExterna: referencia.trim() } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setListo({ ...r.datos.factura, venceEn: r.datos.venceEn });
  }

  const chip = (activo: boolean) =>
    clsx(
      'rounded-xl border px-3 py-1.5 text-sm',
      activo ? 'border-marca bg-marca/15 font-semibold' : 'border-borde hover:border-cian',
    );

  return (
    <>
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<CalendarCheck className="size-3.5" />}
        onClick={() => void abrir()}
        aria-label={`Renovar a ${s.cliente.nombre}`}
      >
        Renovar
      </Boton>
      {abierto && (
        <Dialogo
          titulo={`Renovar a ${s.cliente.nombre}`}
          icono={<CalendarCheck className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
        >
          {listo ? (
            <>
              <Alerta tono="exito">
                Renovada hasta el {formatearFecha(listo.venceEn)}. Factura {listo.numero} pagada (
                {listo.total} {listo.moneda}).
              </Alerta>
              <div className="flex justify-end">
                <Boton onClick={cerrar}>Listo</Boton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-tinta-suave">
                {s.plan.servicio} · {s.plan.nombre}
                {s.venceEn ? ` · vence ${formatearFecha(s.venceEn)}` : ''}
              </p>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">¿Cuánto tiempo?</legend>
                <div className="flex flex-wrap gap-2">
                  {MESES_RENOVACION_RAPIDA.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={plazo.tipo === 'meses' && plazo.meses === m}
                      onClick={() => setPlazo({ tipo: 'meses', meses: m })}
                      className={chip(plazo.tipo === 'meses' && plazo.meses === m)}
                    >
                      {m} {m === 1 ? 'mes' : 'meses'}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={plazo.tipo === 'otro'}
                    onClick={() => setPlazo({ tipo: 'otro' })}
                    className={chip(plazo.tipo === 'otro')}
                  >
                    Otro
                  </button>
                  <button
                    type="button"
                    aria-pressed={plazo.tipo === 'fecha'}
                    onClick={() => setPlazo({ tipo: 'fecha' })}
                    className={chip(plazo.tipo === 'fecha')}
                  >
                    Hasta una fecha
                  </button>
                </div>
                {plazo.tipo === 'otro' && (
                  <label className="grid gap-1 text-sm">
                    Meses
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={otro}
                      onChange={(e) => setOtro(e.currentTarget.value)}
                      className="h-10 w-28 rounded-xl border border-borde bg-hundida px-3 text-sm"
                    />
                  </label>
                )}
                {plazo.tipo === 'fecha' && (
                  <label className="grid gap-1 text-sm">
                    Fecha nueva de vencimiento
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.currentTarget.value)}
                      className="h-10 w-48 rounded-xl border border-borde bg-hundida px-3 text-sm"
                    />
                  </label>
                )}
                {(campos['meses'] ?? campos['venceEn']) && (
                  <p className="text-xs text-peligro">{campos['meses'] ?? campos['venceEn']}</p>
                )}
                {nueva && (
                  <p className="text-sm">
                    Nueva fecha: <b>{formatearFecha(nueva)}</b>
                    {plazo.tipo !== 'fecha' &&
                      (base.getTime() > ahoraMs + 60_000
                        ? ' (cuenta desde su vencimiento: no pierde días).'
                        : ' (cuenta desde hoy).')}
                  </p>
                )}
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Pagó con</legend>
                {lista === null ? (
                  <p className="text-xs text-tinta-tenue">Cargando métodos de cobro…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {deMoneda.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={metodoId === m.id}
                        onClick={() => setMetodoId(m.id)}
                        className={chip(metodoId === m.id)}
                      >
                        {m.nombre}
                      </button>
                    ))}
                    {deMoneda.length === 0 && (
                      <span className="text-xs text-peligro">
                        No hay métodos de cobro en {s.moneda}: agrégalo en Monedas y cobro.
                      </span>
                    )}
                  </div>
                )}
                {campos['metodoCobroId'] && (
                  <p className="text-xs text-peligro">{campos['metodoCobroId']}</p>
                )}
                {metodo && (
                  <label className="grid gap-1 text-sm">
                    Referencia {metodo.requiereReferencia ? '' : '(opcional)'}
                    <input
                      value={referencia}
                      onChange={(e) => setReferencia(e.currentTarget.value)}
                      placeholder={
                        metodo.referenciaUltimos4 ? 'Últimos 4 dígitos' : 'Número de referencia'
                      }
                      className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
                    />
                  </label>
                )}
                <p className="text-xs text-tinta-tenue">
                  Se cobra el precio acordado (o el del plan) por el tiempo elegido. La factura
                  queda pagada y entra en la Caja del día y en el Balance.
                  {s.facturaAbierta &&
                    ` La factura pendiente ${s.facturaAbierta.numero} se anula y la reemplaza esta.`}
                </p>
              </fieldset>
              {error && Object.keys(campos).length === 0 && (
                <Alerta tono="peligro">{error.mensaje}</Alerta>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton
                  icono={<CalendarCheck className="size-4" />}
                  cargando={cargando}
                  disabled={!metodoId || !nueva}
                  onClick={() => void confirmar()}
                >
                  Renovar y marcar pagada
                </Boton>
              </div>
            </>
          )}
        </Dialogo>
      )}
    </>
  );
}

/* ───────────────────────── Cobrar ───────────────────────── */

/** Correo de las cuentas propias: ahí solo se elimina al miembro de un plan de Spotify. */
const DOMINIO_PROPIO = '@serviciosnat.com';

/**
 * «Eliminar» solo en Spotify unido a un plan (el cupo de un miembro) o en
 * cuentas que no son del dominio propio (el correo es de otra persona).
 */
function puedeEliminar(s: SuscripcionConLugar): boolean {
  const pista = s.lugar?.pistaCuenta?.trim().toLowerCase();
  if (pista && !pista.endsWith(DOMINIO_PROPIO)) return true;
  return /spotify/i.test(s.plan.servicio) && esMiembro(s);
}

function cuandoMensaje(d: number): string {
  if (d === 0) return 'vence hoy';
  if (d === -1) return 'vence mañana';
  if (d < -1) return `vence en ${-d} días`;
  return d === 1 ? 'venció hace 1 día' : `venció hace ${d} días`;
}

/** El mensaje de cobro del Gestor, con la plataforma, el cliente y el día. */
export function mensajeCobro(s: SuscripcionConLugar): string {
  return [
    `Hola, ${s.cliente.nombre}.`,
    '',
    `Su suscripción de ${s.plan.servicio} ${cuandoMensaje(s.diasVencida)}.`,
    'Si desea renovar, por favor avísenos con tiempo para mantener activa la suscripción.',
    '',
    '¡Gracias por confiar en NV Streaming!',
  ].join('\n');
}

/** «hoy a las 11:58 a. m.», «ayer a las…» o «el 20 nov. a las…». */
function cuandoCobro(iso: string): string {
  const dia = etiquetaDia(iso);
  const prefijo = dia === 'Hoy' ? 'hoy' : dia === 'Ayer' ? 'ayer' : `el ${dia}`;
  return `${prefijo} a las ${formatearHora(iso)}`;
}

/** Cobrar a mano por WhatsApp o Telegram con el mensaje ya armado (se puede editar). */
function Cobrar({ s }: { s: SuscripcionConLugar }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [numero, setNumero] = useState('');
  const [copiado, setCopiado] = useState(false);
  const telegram = s.contacto.telegram?.replace(/^@/, '') ?? null;
  const digitos = numero.replace(/\D/g, '');

  function abrir() {
    setTexto(mensajeCobro(s));
    setNumero(s.contacto.whatsapp ?? '');
    setCopiado(false);
    setMarcado(false);
    setErrorMarca(null);
    setAbierto(true);
  }

  /** Queda marcado como cobrado hoy (se puede volver a cobrar otro día). */
  async function marcar(canal: 'whatsapp' | 'telegram') {
    const r = await llamarApi('POST', `/suscripciones/${s.id}/cobrado`, { canal });
    if (r.ok) {
      setMarcado(true);
      setErrorMarca(null);
    } else {
      setErrorMarca(r.error.mensaje);
    }
  }

  function cerrar() {
    setAbierto(false);
    if (marcado) router.refresh();
  }

  async function porTelegram() {
    void marcar('telegram');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
    window.open(`https://t.me/${telegram}`, '_blank', 'noopener');
  }

  return (
    <>
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<MessageCircle className="size-3.5" />}
        onClick={abrir}
        aria-label={`${s.cobro ? 'Volver a cobrar' : 'Cobrar'} a ${s.cliente.nombre}`}
      >
        {s.cobro ? 'Volver a cobrar' : 'Cobrar'}
      </Boton>
      {abierto && (
        <Dialogo
          titulo="Cobrar por mensaje"
          icono={<MessageCircle className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
        >
          {s.cobro && (
            <p className="text-sm text-tinta-suave">
              Ya se le cobró {cuandoCobro(s.cobro.en)}
              {s.cobro.por ? ` (${s.cobro.por})` : ''}.
            </p>
          )}
          <label className="grid gap-1 text-sm">
            Mensaje
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              rows={8}
              className="rounded-xl border border-borde bg-hundida p-3 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            WhatsApp
            <input
              value={numero}
              onChange={(e) => setNumero(e.currentTarget.value)}
              inputMode="tel"
              placeholder="584121234567"
              className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
            />
          </label>
          {!s.contacto.whatsapp && !telegram && (
            <Alerta tono="aviso">
              Este cliente no tiene WhatsApp ni Telegram guardados: escribe el número.
            </Alerta>
          )}
          {copiado && <Alerta tono="exito">Mensaje copiado: pégalo en el chat de Telegram.</Alerta>}
          {marcado && <Alerta tono="exito">Quedó marcado como cobrado hoy.</Alerta>}
          {errorMarca && <Alerta tono="peligro">{errorMarca}</Alerta>}
          <div className="flex flex-wrap justify-end gap-2">
            {telegram && (
              <Boton
                variante="secundario"
                icono={<Send className="size-4" />}
                onClick={() => void porTelegram()}
              >
                Telegram (@{telegram})
              </Boton>
            )}
            <a
              href={
                digitos.length >= 8
                  ? `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void marcar('whatsapp')}
              aria-disabled={digitos.length < 8}
              className={clsx(
                'inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-black',
                digitos.length < 8 && 'pointer-events-none opacity-50',
              )}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Enviar por WhatsApp
            </a>
          </div>
        </Dialogo>
      )}
    </>
  );
}

/* ───────────────────────── Clave y PIN ───────────────────────── */

function esMiembro(s: SuscripcionConLugar) {
  const l = s.lugar;
  return !!l && l.tipo === 'familiar' && !l.individual && l.numero !== 1;
}

/** Botón «Copiar» con texto, como en el Gestor. */
function BotonCopiar({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Boton
      tamano="sm"
      variante="secundario"
      icono={copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      disabled={!valor}
      aria-label={`Copiar ${etiqueta.toLowerCase()}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </Boton>
  );
}

function CampoGenerado({
  etiqueta,
  valor,
  onCambiar,
  generar,
  pin = false,
  error,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (v: string) => void;
  generar: () => string;
  pin?: boolean;
  error?: string;
}) {
  return (
    <>
      <div className="flex gap-2">
        <input
          aria-label={etiqueta}
          value={valor}
          onChange={(e) => onCambiar(e.currentTarget.value)}
          spellCheck={false}
          autoComplete="off"
          {...(pin ? { inputMode: 'numeric' as const, maxLength: 8 } : {})}
          className={clsx(
            'h-10 rounded-xl border border-borde bg-hundida px-3 font-mono text-sm',
            pin ? 'w-32' : 'min-w-0 flex-1',
          )}
        />
        <Boton
          tamano="sm"
          variante="secundario"
          icono={<Wand2 className="size-3.5" />}
          onClick={() => onCambiar(generar())}
        >
          Generar
        </Boton>
        <BotonCopiar etiqueta={etiqueta} valor={valor} />
      </div>
      {error && <p className="text-xs text-peligro">{error}</p>}
    </>
  );
}

/** Opciones de clave y PIN, iguales en «Cortar» y en «Clave o PIN». */
function useClavePin(s: SuscripcionConLugar, obligatorio: boolean) {
  const [modoClave, setModoClave] = useState(obligatorio ? '' : 'misma');
  const [clave, setClave] = useState('');
  const [modoPin, setModoPin] = useState(obligatorio ? '' : 'mismo');
  const [pin, setPin] = useState('');
  const usaPin = s.lugar ? TEXTOS_PLATAFORMA[s.lugar.tipo].usaPin : false;
  const miembro = esMiembro(s);
  const reiniciar = () => {
    setModoClave(obligatorio ? '' : 'misma');
    setModoPin(obligatorio ? '' : 'mismo');
    setClave('');
    setPin('');
  };
  const faltaElegir = !modoClave || (usaPin && !modoPin);
  const nuevaClave = modoClave === 'nueva' ? clave.trim() : '';
  const nuevoPin = usaPin && modoPin === 'nuevo' ? pin.trim() : '';
  const campos = (error: ErrorLlamada | null) => {
    const c = erroresPorCampo(error);
    return (
      <>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {miembro ? 'Contraseña del miembro' : 'Contraseña de la cuenta'}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Opcion nombre="clave" valor="misma" actual={modoClave} onElegir={setModoClave}>
              Misma contraseña
            </Opcion>
            <Opcion
              nombre="clave"
              valor="nueva"
              actual={modoClave}
              onElegir={(v) => {
                setModoClave(v);
                if (!clave) setClave(generarClave());
              }}
            >
              Nueva contraseña
            </Opcion>
          </div>
          {modoClave === 'nueva' && (
            <CampoGenerado
              etiqueta="Contraseña nueva"
              valor={clave}
              onCambiar={setClave}
              generar={generarClave}
              error={c.nuevaClave ?? c.clave ?? c.claveMiembro}
            />
          )}
          <p className="text-xs text-tinta-tenue">
            {miembro
              ? 'Es la clave propia de ese cupo del plan familiar; la cuenta principal no cambia.'
              : 'Se guarda en la cuenta y todos los que siguen en ella la ven al momento en «Mis accesos». Cámbiala también en la plataforma.'}
          </p>
        </fieldset>
        {usaPin && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">PIN del perfil</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcion nombre="pin" valor="mismo" actual={modoPin} onElegir={setModoPin}>
                Mismo PIN
              </Opcion>
              <Opcion
                nombre="pin"
                valor="nuevo"
                actual={modoPin}
                onElegir={(v) => {
                  setModoPin(v);
                  if (!pin) setPin(generarPin());
                }}
              >
                Nuevo PIN
              </Opcion>
            </div>
            {modoPin === 'nuevo' && (
              <CampoGenerado
                etiqueta="PIN nuevo"
                valor={pin}
                onCambiar={setPin}
                generar={generarPin}
                pin
                error={c.nuevoPin ?? c.pin}
              />
            )}
          </fieldset>
        )}
      </>
    );
  };
  return { campos, reiniciar, faltaElegir, nuevaClave, nuevoPin, miembro, modoClave };
}

/** Cambiar la clave de la cuenta (o del miembro) y el PIN del perfil sin cortar. */
function CambiarDatos({ s }: { s: SuscripcionConLugar }) {
  const lugar = s.lugar!;
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [nada, setNada] = useState(false);
  const router = useRouter();
  const f = useClavePin(s, false);

  function cerrar() {
    if (listo) router.refresh();
    setAbierto(false);
    setListo(false);
    setError(null);
    setNada(false);
    f.reiniciar();
  }

  async function guardar() {
    setError(null);
    setNada(!f.nuevaClave && !f.nuevoPin);
    if (!f.nuevaClave && !f.nuevoPin) return;
    setCargando(true);
    const perfil = {
      ...(f.nuevoPin ? { pin: f.nuevoPin } : {}),
      ...(f.miembro && f.nuevaClave ? { claveMiembro: f.nuevaClave } : {}),
    };
    if (Object.keys(perfil).length > 0) {
      const r = await llamarApi(
        'PATCH',
        `/cuentas/${lugar.cuentaId}/perfiles/${lugar.perfilId}`,
        perfil,
      );
      if (!r.ok) {
        setCargando(false);
        return setError(r.error);
      }
    }
    if (!f.miembro && f.nuevaClave) {
      const r = await llamarApi('PATCH', `/cuentas/${lugar.cuentaId}`, { clave: f.nuevaClave });
      if (!r.ok) {
        setCargando(false);
        return setError(r.error);
      }
    }
    setCargando(false);
    setListo(true);
  }

  return (
    <>
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<KeyRound className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Cambiar clave o PIN de ${s.cliente.nombre}`}
      >
        {TEXTOS_PLATAFORMA[lugar.tipo].usaPin ? 'Clave o PIN' : 'Clave'}
      </Boton>
      {abierto && (
        <Dialogo
          titulo={listo ? 'Datos guardados' : 'Cambiar clave o PIN'}
          icono={<KeyRound className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
          bloquear={cargando}
        >
          {listo ? (
            <>
              <Alerta tono="exito">
                Guardado. {s.cliente.nombre}
                {!f.miembro && f.nuevaClave && lugar.otrosActivos > 0
                  ? ` y ${lugar.otrosActivos === 1 ? 'la otra persona' : `las otras ${lugar.otrosActivos}`} de la cuenta`
                  : ''}{' '}
                ven los datos nuevos en «Mis accesos» y les avisamos solos por correo y WhatsApp
                (sin la clave ni el PIN).
              </Alerta>
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-tinta-suave">
                {s.cliente.nombre} · {s.plan.servicio} · {lugar.etiqueta}
                {lugar.pistaCuenta ? ` · ${lugar.pistaCuenta}` : ''}. El cliente sigue en su{' '}
                {TEXTOS_PLATAFORMA[lugar.tipo].lugar.toLowerCase()}.
              </p>
              {f.campos(error)}
              {nada && <Alerta tono="aviso">Elige una contraseña o un PIN nuevos.</Alerta>}
              {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton cargando={cargando} onClick={() => void guardar()}>
                  Guardar
                </Boton>
              </div>
            </>
          )}
        </Dialogo>
      )}
    </>
  );
}

/* ───────────────────────── Ubicación y datos ───────────────────────── */

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-tinta-tenue">{etiqueta}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Un dato secreto con ver/ocultar y copiar; nunca se guarda fuera de esta pantalla. */
export function Secreto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono" aria-label={etiqueta}>
        {ver ? valor : '••••••••'}
      </span>
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? `Ocultar ${etiqueta.toLowerCase()}` : `Ver ${etiqueta.toLowerCase()}`}
        className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
      >
        {ver ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <BotonCopiar etiqueta={etiqueta} valor={valor} />
    </span>
  );
}

export function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono font-medium" title={valor}>
        {valor}
      </span>
      <BotonCopiar etiqueta={etiqueta} valor={valor} />
    </span>
  );
}

/**
 * Dónde está el cliente que se va a cortar (plataforma, cuenta y perfil o cupo)
 * y, con permiso, «Ver datos» como en Plataformas: correo, contraseña y PIN
 * actuales, descifrados al pedirlos (queda en la auditoría).
 */
function UbicacionCliente({ s, puedeRevelar }: { s: SuscripcionConLugar; puedeRevelar: boolean }) {
  const lugar = s.lugar!;
  const textos = TEXTOS_PLATAFORMA[lugar.tipo];
  const [datos, setDatos] = useState<CredencialesCuenta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perfil = datos?.perfiles.find((p) => p.numero === lugar.numero) ?? null;
  const miembro = esMiembro(s);
  const nombre = lugar.nombre && lugar.nombre !== lugar.etiqueta ? ` · «${lugar.nombre}»` : '';

  async function ver() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<CredencialesCuenta>('POST', `/cuentas/${lugar.cuentaId}/revelar`, {});
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    setDatos(r.datos);
  }

  // Como en el Gestor: al abrir el corte ya salen el correo y la clave para copiarlos.
  const pedido = useRef(false);
  useEffect(() => {
    if (!puedeRevelar || pedido.current) return;
    pedido.current = true;
    void ver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeRevelar]);

  return (
    <div className="grid gap-3 rounded-xl border border-borde bg-hundida p-3 text-sm">
      <dl className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Cliente">
          <span className="font-medium">{s.cliente.nombre}</span>
        </Dato>
        <Dato etiqueta="Plataforma">{s.plan.servicio}</Dato>
        <Dato etiqueta="Cuenta">
          <Link
            href={`/admin/cuentas/${lugar.cuentaId}`}
            className="font-mono hover:text-cian hover:underline"
          >
            {datos?.usuario ?? lugar.pistaCuenta ?? 'Ver cuenta'}
          </Link>
          {lugar.individual && <span className="text-tinta-tenue"> · individual</span>}
        </Dato>
        <Dato etiqueta={`${textos.lugar} donde está`}>
          <span className="font-medium">
            {textos.lugar} {lugar.numero}
            {nombre}
          </span>
        </Dato>
        <Dato etiqueta="Venció">
          <span className="text-peligro">
            {s.venceEn ? formatearFecha(s.venceEn) : 'Sin fecha'}
          </span>
        </Dato>
        <Dato etiqueta="Plan">{s.plan.nombre}</Dato>
      </dl>
      {datos ? (
        <dl className="grid gap-2 border-t border-borde pt-3 sm:grid-cols-2">
          <Dato etiqueta="Correo de la cuenta">
            <Copiable etiqueta="El correo de la cuenta" valor={datos.usuario} />
          </Dato>
          <Dato etiqueta="Contraseña de la cuenta">
            <Secreto etiqueta="La contraseña de la cuenta" valor={datos.clave} />
          </Dato>
          {miembro && perfil?.usuarioMiembro && (
            <Dato etiqueta="Correo del miembro">
              <Copiable etiqueta="El correo del miembro" valor={perfil.usuarioMiembro} />
            </Dato>
          )}
          {miembro && perfil?.claveMiembro && (
            <Dato etiqueta="Contraseña del miembro">
              <Secreto etiqueta="La contraseña del miembro" valor={perfil.claveMiembro} />
            </Dato>
          )}
          {textos.usaPin && (
            <Dato etiqueta={`PIN del ${textos.lugar.toLowerCase()} ${lugar.numero}`}>
              {perfil?.pin ? (
                <Secreto etiqueta="El PIN" valor={perfil.pin} />
              ) : (
                <span className="text-tinta-tenue">Sin PIN</span>
              )}
            </Dato>
          )}
          {perfil && perfil.nombre && perfil.nombre !== lugar.nombre && (
            <Dato etiqueta={`Nombre del ${textos.lugar.toLowerCase()}`}>{perfil.nombre}</Dato>
          )}
        </dl>
      ) : (
        puedeRevelar && (
          <div className="flex flex-wrap items-center gap-2">
            <Boton
              tamano="sm"
              variante="secundario"
              icono={<Eye className="size-3.5" />}
              cargando={cargando}
              onClick={() => void ver()}
            >
              Ver datos
            </Boton>
            <span className="text-xs text-tinta-tenue">
              Correo, contraseña{textos.usaPin ? ' y PIN' : ''} actuales para cortarlo en la
              plataforma.
            </span>
            {error && <span className="text-xs text-peligro">{error}</span>}
          </div>
        )
      )}
    </div>
  );
}

/* ───────────────────────── Cortar ───────────────────────── */

/**
 * Corte por vencimiento (como el del Gestor): hay que elegir qué pasa con la
 * clave y el PIN antes de confirmar. El lugar queda libre y la suscripción
 * suspendida; queda en el historial de la suscripción y en la auditoría.
 */
function Cortar({
  s,
  hermanos,
  puedeRevelar,
}: {
  s: SuscripcionConLugar;
  hermanos: number;
  puedeRevelar: boolean;
}) {
  const lugar = s.lugar!;
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [aviso, setAviso] = useState(false);
  const router = useRouter();
  const f = useClavePin(s, true);
  const textos = TEXTOS_PLATAFORMA[lugar.tipo];

  function cerrar() {
    if (listo !== null) router.refresh();
    setAbierto(false);
    setListo(null);
    setError(null);
    setAviso(false);
    f.reiniciar();
  }

  async function confirmar() {
    if (f.faltaElegir) return setAviso(true);
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ cortadas: number }>('POST', `/suscripciones/${s.id}/cortar`, {
      ...(f.nuevaClave ? { nuevaClave: f.nuevaClave } : {}),
      ...(f.nuevoPin ? { nuevoPin: f.nuevoPin } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setListo(r.datos.cortadas);
  }

  return (
    <>
      <Boton
        tamano="sm"
        variante="peligro"
        icono={<Scissors className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Cortar a ${s.cliente.nombre}`}
      >
        Cortar
      </Boton>
      {abierto && (
        <Dialogo
          titulo={listo !== null ? 'Cliente cortado' : 'Cortar cliente'}
          icono={<Scissors className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
          bloquear={cargando}
        >
          {listo !== null ? (
            <>
              <Alerta tono="exito">
                {s.cliente.nombre} quedó cortado.{' '}
                {listo > 1
                  ? `Sus ${listo} ${textos.lugares.toLowerCase()} quedaron libres`
                  : `El ${textos.lugar.toLowerCase()} quedó libre`}
                {f.nuevaClave ? ', con la contraseña nueva guardada' : ''}
                {f.nuevoPin ? ' y PIN nuevo' : ''}. Su suscripción quedó suspendida y puede
                renovarse cuando pague.
              </Alerta>
              <ol className="grid list-decimal gap-1 pl-5 text-sm text-tinta-suave">
                <li>Entra a la cuenta en la plataforma.</li>
                {f.nuevaClave && <li>Cambia la contraseña por la nueva que guardaste.</li>}
                {f.miembro ? (
                  <li>Saca al miembro de ese cupo del plan familiar.</li>
                ) : (
                  <li>
                    Deja listo el {textos.lugar.toLowerCase()}
                    {f.nuevoPin ? ' con el PIN nuevo' : ''}.
                  </li>
                )}
              </ol>
              {!f.miembro && f.nuevaClave && lugar.otrosActivos > 0 && (
                <p className="text-sm text-tinta-suave">
                  {lugar.otrosActivos === 1
                    ? 'A la persona que sigue en la cuenta le avisamos sola'
                    : `A las ${lugar.otrosActivos} personas que siguen en la cuenta les avisamos solas`}{' '}
                  por correo y WhatsApp para que vean la clave nueva en «Mis accesos».
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <UbicacionCliente s={s} puedeRevelar={puedeRevelar} />
              <p className="text-sm text-tinta-suave">
                Corte por vencimiento: el cliente no renovó. Su {textos.lugar.toLowerCase()} queda
                libre para otro cliente y su suscripción pasa a suspendida (no se borra nada).
                {f.miembro &&
                  ' El cupo conserva el correo del miembro; para borrarlo usa «Eliminar».'}
                {hermanos > 0 &&
                  (hermanos === 1
                    ? ` También se corta su otro ${textos.lugar.toLowerCase()} vencido en esta cuenta.`
                    : ` También se cortan sus otros ${hermanos} ${textos.lugares.toLowerCase()} vencidos en esta cuenta.`)}
                {lugar.otrosActivos > 0 &&
                  (lugar.otrosActivos === 1
                    ? ' Sigue 1 persona al día en la cuenta.'
                    : ` Siguen ${lugar.otrosActivos} personas al día en la cuenta.`)}
              </p>
              {f.campos(error)}
              {aviso && f.faltaElegir && (
                <Alerta tono="aviso">
                  Elige qué hacer con la contraseña{textos.usaPin ? ' y con el PIN' : ''}.
                </Alerta>
              )}
              {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton variante="peligro" cargando={cargando} onClick={() => void confirmar()}>
                  Confirmar corte
                </Boton>
              </div>
            </>
          )}
        </Dialogo>
      )}
    </>
  );
}

/* ───────────────────────── Eliminar ───────────────────────── */

/**
 * «Eliminar» del Gestor: a diferencia de cortar, en un plan familiar se borra
 * también el correo y la clave del miembro, y la suscripción se cancela. El
 * cliente y su historial se conservan. Pide confirmarlo escribiendo ELIMINAR.
 */
function Eliminar({ s }: { s: SuscripcionConLugar }) {
  const lugar = s.lugar!;
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [aviso, setAviso] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const router = useRouter();
  const f = useClavePin(s, true);
  const miembro = esMiembro(s);
  const textos = TEXTOS_PLATAFORMA[lugar.tipo];
  // Al miembro se le borra su clave: solo se elige el PIN (si la plataforma lo usa).
  const faltaElegir = miembro ? false : f.faltaElegir;
  const confirmado = confirmacion.trim().toUpperCase() === 'ELIMINAR';

  function cerrar() {
    if (listo) router.refresh();
    setAbierto(false);
    setListo(false);
    setError(null);
    setAviso(false);
    setConfirmacion('');
    f.reiniciar();
  }

  async function confirmar() {
    if (faltaElegir || !confirmado) return setAviso(true);
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/suscripciones/${s.id}/eliminar-del-lugar`, {
      ...(!miembro && f.nuevaClave ? { nuevaClave: f.nuevaClave } : {}),
      ...(f.nuevoPin ? { nuevoPin: f.nuevoPin } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setListo(true);
  }

  return (
    <>
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<Trash2 className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Eliminar a ${s.cliente.nombre} de su ${textos.lugar.toLowerCase()}`}
      >
        Eliminar
      </Boton>
      {abierto && (
        <Dialogo
          titulo={listo ? 'Cliente eliminado' : 'Eliminar cliente'}
          icono={<Trash2 className="size-5 text-peligro" aria-hidden="true" />}
          onCerrar={cerrar}
          bloquear={cargando}
        >
          {listo ? (
            <>
              <Alerta tono="exito">
                {s.cliente.nombre} salió de su {textos.lugar.toLowerCase()}
                {miembro ? ' y se borró su correo del cupo' : ''}. Su suscripción quedó cancelada;
                el cliente y su historial se conservan.
              </Alerta>
              {miembro && (
                <p className="text-sm text-tinta-suave">
                  Saca al miembro del plan familiar en la plataforma.
                </p>
              )}
              <div className="flex justify-end">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-tinta-suave">
                {s.cliente.nombre} · {s.plan.servicio} · {lugar.etiqueta}
                {lugar.pistaCuenta ? ` · ${lugar.pistaCuenta}` : ''}.
              </p>
              <Alerta tono="aviso">
                {miembro
                  ? 'A diferencia de «Cortar», se borra el correo y la clave del miembro de este cupo y su suscripción se cancela. No se puede deshacer.'
                  : `Su ${textos.lugar.toLowerCase()} queda libre y su suscripción se cancela (se anulan sus facturas abiertas). No se puede deshacer.`}
              </Alerta>
              {miembro ? (textos.usaPin ? f.campos(error) : null) : f.campos(error)}
              <label className="grid gap-1 text-sm">
                <span>
                  Escribe <b>ELIMINAR</b> para confirmar
                </span>
                <input
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.currentTarget.value)}
                  autoComplete="off"
                  className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
                />
              </label>
              {aviso && (faltaElegir || !confirmado) && (
                <Alerta tono="aviso">
                  {faltaElegir
                    ? `Elige qué hacer con la contraseña${textos.usaPin ? ' y con el PIN' : ''}.`
                    : 'Escribe ELIMINAR para confirmar.'}
                </Alerta>
              )}
              {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton variante="peligro" cargando={cargando} onClick={() => void confirmar()}>
                  Eliminar
                </Boton>
              </div>
            </>
          )}
        </Dialogo>
      )}
    </>
  );
}
