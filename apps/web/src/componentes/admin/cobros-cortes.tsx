'use client';

import {
  type CredencialesCuenta,
  generarClave,
  generarPin,
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
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearFecha } from '@/lib/formato';
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
}: {
  seccion: Seccion;
  lista: SuscripcionConLugar[];
  horaCorte: number;
  pasoHoraCorte: boolean;
  puedeCortar: boolean;
  /** Con `cuentas.revelar`: «Ver datos» de la cuenta y el perfil al cortar. */
  puedeRevelar?: boolean;
}) {
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
  hermanos,
}: {
  s: SuscripcionConLugar;
  seccion: Seccion;
  puedeCortar: boolean;
  puedeRevelar: boolean;
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
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link
          href={`/admin/suscripciones/${s.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borde-fuerte px-3 text-sm font-semibold hover:border-cian"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {s.facturaAbierta ? `Factura ${s.facturaAbierta.numero}` : 'Renovar'}
        </Link>
        {puedeCortar && s.lugar && <CambiarDatos s={s} />}
        {puedeCortar && s.lugar && seccion === 'cortes' && (
          <Cortar s={s} hermanos={hermanos} puedeRevelar={puedeRevelar} />
        )}
        {puedeCortar && s.lugar && seccion === 'cortes' && <Eliminar s={s} />}
      </div>
    </li>
  );
}

/* ───────────────────────── Clave y PIN ───────────────────────── */

function esMiembro(s: SuscripcionConLugar) {
  const l = s.lugar;
  return !!l && l.tipo === 'familiar' && !l.individual && l.numero !== 1;
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
function Secreto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [ver, setVer] = useState(false);
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  }
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
      <button
        type="button"
        onClick={() => void copiar()}
        aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono font-medium" title={valor}>
        {valor}
      </span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          } catch {
            setCopiado(false);
          }
        }}
        aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
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
