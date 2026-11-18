'use client';

import {
  type AvisoCuenta,
  type AvisosCuenta,
  type ClienteResumen,
  type DestinoMover,
  esTitular,
  formatearMonto,
  generarClave,
  generarPin,
  MESES_ALTA,
  type MetodoCobroPublico,
  type Moneda,
  MONEDAS,
  type PerfilCuentaPublico,
  type PlanPublico,
  type ResultadoAltaPerfil,
  TEXTOS_PLATAFORMA,
  type TipoPlataforma,
} from '@nv/shared';
import {
  ArrowRightLeft,
  BellRing,
  Check,
  Mail,
  MessageCircle,
  Scissors,
  Send,
  UserPlus,
  Wand2,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { useRouter } from 'next/navigation';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { claveDia, formatearDia } from '@/lib/formato';
import { useAccion } from './piezas';

/** Pide abrir «Avisar datos» de una cuenta (después de cambiar la clave o de un corte). */
const EVENTO_AVISAR = 'nv:avisar-cuenta';
export function pedirAvisoCuenta(cuentaId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_AVISAR, { detail: cuentaId }));
}

/** Perfiles recién asignados: su botón «Mensaje» se abre solo para enviar los datos. */
export const recienAsignados = new Set<string>();

export function Dialogo({
  titulo,
  icono,
  onCerrar,
  bloquear = false,
  ancho = 'max-w-lg',
  children,
}: {
  titulo: string;
  icono: ReactNode;
  onCerrar: () => void;
  bloquear?: boolean;
  ancho?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      onClose={onCerrar}
      onCancel={(e) => {
        if (bloquear) e.preventDefault();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${ancho} rounded-nv border border-borde bg-elevada p-0 text-left text-tinta shadow-nv backdrop:bg-black/60`}
    >
      <div className="grid max-h-[85dvh] gap-4 overflow-y-auto p-5 sm:p-6">
        <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
          {icono}
          {titulo}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

const claseEnlaceBoton =
  'inline-flex items-center gap-1.5 rounded-[0.875rem] border border-borde-fuerte px-3 py-1.5 text-sm font-semibold hover:border-cian';

function Opcion({
  nombre,
  valor,
  actual,
  onElegir,
  children,
}: {
  nombre: string;
  valor: string;
  actual: string;
  onElegir: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
        actual === valor ? 'border-cian bg-cian/10' : 'border-borde'
      }`}
    >
      <input
        type="radio"
        name={nombre}
        value={valor}
        checked={actual === valor}
        onChange={() => onElegir(valor)}
        className="accent-[var(--color-cian)]"
      />
      {children}
    </label>
  );
}

/* ─────────────────────────────── Cortar ─────────────────────────────── */

/**
 * Corte por incumplimiento (o liberar al terminar): el perfil queda libre y,
 * si se pide, la cuenta guarda una clave nueva y el perfil un PIN nuevo. Con
 * clave nueva se ofrece avisar a los que siguen en la cuenta.
 */
export function CortarPerfil({
  cuentaId,
  perfil,
  tipo,
  otrosActivos,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  tipo: TipoPlataforma;
  /** Clientes vigentes que seguirían en la cuenta. */
  otrosActivos: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modoClave, setModoClave] = useState('misma');
  const [clave, setClave] = useState('');
  const [modoPin, setModoPin] = useState('mismo');
  const [pin, setPin] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const router = useRouter();
  const campos = erroresPorCampo(error);
  const textos = TEXTOS_PLATAFORMA[tipo];
  const terminada = perfil.asignacion?.terminada ?? false;

  function cerrar() {
    if (listo) router.refresh();
    setAbierto(false);
    setListo(false);
    setModoClave('misma');
    setModoPin('mismo');
    setClave('');
    setPin('');
  }

  async function confirmar() {
    const claveNueva = modoClave === 'nueva' ? clave.trim() : '';
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/liberar`, {
      ...(claveNueva ? { nuevaClave: claveNueva } : {}),
      ...(modoPin === 'nuevo' && pin.trim() ? { nuevoPin: pin.trim() } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    // El aviso se pide antes de refrescar: al refrescar, este perfil queda libre y su botón se va.
    if (claveNueva && avisar && otrosActivos > 0) {
      cerrar();
      pedirAvisoCuenta(cuentaId);
      router.refresh();
    } else {
      // Se refresca al cerrar los pasos: al refrescar, este perfil queda libre y el botón se va.
      setListo(true);
    }
  }

  return (
    <>
      <Boton
        tamano="sm"
        variante={terminada ? 'secundario' : 'fantasma'}
        icono={<Scissors className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Cortar ${perfil.nombre}`}
      >
        {terminada ? 'Liberar' : 'Cortar'}
      </Boton>
      {abierto && (
        <Dialogo
          titulo={listo ? `${textos.lugar} liberado` : 'Cortar y liberar'}
          icono={<Scissors className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
          bloquear={cargando}
        >
          {listo ? (
            <>
              <Alerta tono="exito">
                {perfil.nombre} quedó libre
                {modoClave === 'nueva' ? ' y la cuenta tiene la clave nueva guardada' : ''}
                {modoPin === 'nuevo' ? ', con PIN nuevo' : ''}.
              </Alerta>
              <ol className="grid list-decimal gap-1 pl-5 text-sm text-tinta-suave">
                <li>
                  Entra a la cuenta en {textos.lugar === 'Perfil' ? 'la plataforma' : 'el plan'}.
                </li>
                {modoClave === 'nueva' && <li>Cambia la clave por la nueva que guardaste.</li>}
                {tipo === 'familiar' ? (
                  <li>Saca al miembro de ese cupo del plan familiar.</li>
                ) : (
                  <li>
                    Ubica el {textos.lugar.toLowerCase()} y déjalo listo
                    {modoPin === 'nuevo' ? ' con el PIN nuevo' : ''}.
                  </li>
                )}
              </ol>
              <div className="flex justify-end">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-tinta-suave">
                {perfil.asignacion?.cliente.nombre ?? 'El cliente'} deja de tener {perfil.nombre}.
                Su suscripción no cambia: si no pagó, márcala aparte. Hay{' '}
                {otrosActivos === 1 ? '1 persona más' : `${otrosActivos} personas más`} usando la
                cuenta.
              </p>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Contraseña de la cuenta</legend>
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
                  <div className="flex gap-2">
                    <input
                      aria-label="Contraseña nueva"
                      value={clave}
                      onChange={(e) => setClave(e.currentTarget.value)}
                      spellCheck={false}
                      autoComplete="off"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-borde bg-hundida px-3 font-mono text-sm"
                    />
                    <Boton
                      tamano="sm"
                      variante="secundario"
                      icono={<Wand2 className="size-3.5" />}
                      onClick={() => setClave(generarClave())}
                    >
                      Generar
                    </Boton>
                  </div>
                )}
                {campos.nuevaClave && <p className="text-xs text-peligro">{campos.nuevaClave}</p>}
                <p className="text-xs text-tinta-tenue">
                  Cambiarla evita que el cliente cortado siga entrando. Cámbiala también en la
                  plataforma.
                </p>
              </fieldset>
              {textos.usaPin && (
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
                    <div className="flex gap-2">
                      <input
                        aria-label="PIN nuevo"
                        value={pin}
                        inputMode="numeric"
                        maxLength={8}
                        onChange={(e) => setPin(e.currentTarget.value)}
                        className="h-10 w-32 rounded-xl border border-borde bg-hundida px-3 font-mono text-sm"
                      />
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        icono={<Wand2 className="size-3.5" />}
                        onClick={() => setPin(generarPin())}
                      >
                        Generar
                      </Boton>
                    </div>
                  )}
                  {campos.nuevoPin && <p className="text-xs text-peligro">{campos.nuevoPin}</p>}
                </fieldset>
              )}
              {modoClave === 'nueva' && otrosActivos > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={avisar}
                    onChange={(e) => setAvisar(e.currentTarget.checked)}
                  />
                  Avisar la clave nueva a{' '}
                  {otrosActivos === 1 ? 'la persona que sigue' : `los ${otrosActivos} que siguen`}
                </label>
              )}
              {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton cargando={cargando} onClick={() => void confirmar()}>
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

/* ─────────────────────────────── Mover ─────────────────────────────── */

/** Pasa al cliente a otro lugar libre del mismo servicio (por ejemplo, si su cuenta se cayó). */
export function MoverPerfil({
  cuentaId,
  perfil,
  tipo,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  tipo: TipoPlataforma;
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinos, setDestinos] = useState<DestinoMover[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [hoy, setHoy] = useState(0);
  const { cargando, error, ejecutar } = useAccion();
  const textos = TEXTOS_PLATAFORMA[tipo];

  async function abrir() {
    setAbierto(true);
    setHoy(Date.now());
    setDestinos(null);
    setErrorLista(null);
    const r = await llamarApi<DestinoMover[]>(
      'GET',
      `/cuentas/${cuentaId}/perfiles/${perfil.id}/destinos`,
    );
    if (r.ok) setDestinos(r.datos);
    else setErrorLista(r.error.mensaje);
  }

  async function mover() {
    if (!elegido) return;
    const r = await ejecutar('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/mover`, {
      destinoPerfilId: elegido,
    });
    if (r) setAbierto(false);
  }

  const visibles = (destinos ?? []).filter((d) =>
    d.pista.toLowerCase().includes(filtro.trim().toLowerCase()),
  );
  const dias = (f: string | null) =>
    f ? Math.round((new Date(`${f}T00:00:00Z`).getTime() - hoy) / 86_400_000) : null;

  return (
    <>
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<ArrowRightLeft className="size-3.5" />}
        onClick={() => void abrir()}
        aria-label={`Mover ${perfil.nombre}`}
      >
        Mover
      </Boton>
      {abierto && (
        <Dialogo
          titulo={`Mover a ${perfil.asignacion?.cliente.nombre ?? 'el cliente'}`}
          icono={<ArrowRightLeft className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={() => {
            setAbierto(false);
            setElegido(null);
          }}
          bloquear={cargando}
        >
          <p className="text-sm text-tinta-suave">
            Pasa con su suscripción y sus fechas. {perfil.nombre} queda libre y cada{' '}
            {textos.lugar.toLowerCase()} conserva su PIN. Primero las cuentas que vencen más tarde.
          </p>
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.currentTarget.value)}
            placeholder="Buscar por correo"
            aria-label="Buscar por correo"
            className="h-10 rounded-xl border border-borde bg-hundida px-3 text-sm"
          />
          {errorLista && <Alerta tono="peligro">{errorLista}</Alerta>}
          {!destinos && !errorLista && <p className="text-sm text-tinta-tenue">Buscando…</p>}
          {destinos && visibles.length === 0 && (
            <Alerta tono="info">
              No hay {textos.lugares.toLowerCase()} libres de este servicio. Agrega una cuenta o
              libera uno.
            </Alerta>
          )}
          <ul className="grid gap-2">
            {visibles.map((d) => {
              const n = dias(d.facturaEn);
              return (
                <li key={d.cuentaId} className="grid gap-2 rounded-xl border border-borde p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-mono">{d.pista}</span>
                    <span className="text-xs text-tinta-tenue">
                      {d.perfiles.length} libre{d.perfiles.length === 1 ? '' : 's'}
                      {d.plan ? ` · ${d.plan}` : ''}
                      {d.facturaEn
                        ? ` · vence ${formatearDia(d.facturaEn)}${n !== null ? ` (en ${n} días)` : ''}`
                        : ''}
                      {d.cuentaId === cuentaId ? ' · esta cuenta' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.perfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setElegido(p.id)}
                        aria-pressed={elegido === p.id}
                        className={`rounded-lg border px-2.5 py-1 text-xs ${
                          elegido === p.id
                            ? 'border-cian bg-cian/15 font-semibold'
                            : 'border-borde hover:border-cian'
                        }`}
                      >
                        {p.nombre}
                        {p.respaldo ? ' · respaldo' : ''}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setAbierto(false)} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton cargando={cargando} disabled={!elegido} onClick={() => void mover()}>
              {elegido ? 'Mover' : 'Elige destino'}
            </Boton>
          </div>
        </Dialogo>
      )}
    </>
  );
}

/* ─────────────────────────────── Avisar datos ─────────────────────────────── */

function Fila({
  aviso,
  incluido,
  enviado,
  onIncluir,
  onEnviado,
}: {
  aviso: AvisoCuenta;
  incluido: boolean;
  enviado: boolean;
  onIncluir: (v: boolean) => void;
  onEnviado: () => void;
}) {
  const [verTexto, setVerTexto] = useState(false);
  return (
    <li className="grid gap-2 rounded-xl border border-borde p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={incluido}
            onChange={(e) => onIncluir(e.currentTarget.checked)}
          />
          <span className="font-medium">{aviso.cliente.nombre}</span>
          <span className="text-xs text-tinta-tenue">{aviso.perfil}</span>
        </label>
        <Insignia tono={enviado ? 'exito' : 'neutro'}>{enviado ? 'Enviado' : 'Pendiente'}</Insignia>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aviso.whatsapp && (
          <a
            href={aviso.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEnviado}
            className={claseEnlaceBoton}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp
          </a>
        )}
        {aviso.telegram && (
          <a
            href={`https://t.me/${aviso.telegram}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void navigator.clipboard?.writeText(aviso.texto).catch(() => undefined);
              onEnviado();
            }}
            className={claseEnlaceBoton}
            title="Copia el mensaje y abre el chat: pégalo allí."
          >
            <Send className="size-4" aria-hidden="true" />
            Telegram
          </a>
        )}
        {aviso.correo && (
          <a href={aviso.correo} onClick={onEnviado} className={claseEnlaceBoton}>
            <Mail className="size-4" aria-hidden="true" />
            Correo
          </a>
        )}
        {!aviso.whatsapp && !aviso.telegram && !aviso.correo && (
          <span className="text-xs text-tinta-tenue">Sin contacto: copia el mensaje.</span>
        )}
        <Boton tamano="sm" variante="fantasma" onClick={() => setVerTexto((v) => !v)}>
          {verTexto ? 'Ocultar mensaje' : 'Ver mensaje'}
        </Boton>
        {!enviado && (
          <Boton
            tamano="sm"
            variante="fantasma"
            icono={<Check className="size-3.5" />}
            onClick={onEnviado}
          >
            Marcar enviado
          </Boton>
        )}
      </div>
      {verTexto && (
        <textarea
          readOnly
          value={aviso.texto}
          rows={8}
          aria-label={`Mensaje para ${aviso.cliente.nombre}`}
          className="w-full resize-y rounded-xl border border-borde bg-superficie p-3 font-mono text-xs"
        />
      )}
    </li>
  );
}

/**
 * «Avisar datos de la cuenta»: un mensaje por cliente con los datos de ahora,
 * para enviarlos a mano uno por uno. Se abre con su botón o sola después de
 * cambiar la clave (Editar cuenta) o de un corte con clave nueva.
 */
export function AvisarDatos({ cuentaId, asignados }: { cuentaId: string; asignados: number }) {
  const [abierto, setAbierto] = useState(false);
  const [incluir, setIncluir] = useState<'activos' | 'todos'>('activos');
  const [nota, setNota] = useState('');
  const [datos, setDatos] = useState<AvisosCuenta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [despues, setDespues] = useState(false);

  const abrir = useCallback((trasCambio: boolean) => {
    setAbierto(true);
    setDespues(trasCambio);
    setDatos(null);
    setError(null);
    setFuera(new Set());
    setEnviados(new Set());
  }, []);

  useEffect(() => {
    const oir = (e: Event) => {
      if ((e as CustomEvent<string>).detail === cuentaId) abrir(true);
    };
    window.addEventListener(EVENTO_AVISAR, oir);
    return () => window.removeEventListener(EVENTO_AVISAR, oir);
  }, [cuentaId, abrir]);

  async function armar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<AvisosCuenta>('POST', `/cuentas/${cuentaId}/avisos`, {
      incluir,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    setDatos(r.datos);
    setEnviados(new Set());
  }

  const lista = datos?.avisos.filter((a) => !fuera.has(a.perfilId)) ?? [];
  const avisados = lista.filter((a) => enviados.has(a.perfilId)).length;
  const siguiente = lista.find((a) => !enviados.has(a.perfilId) && a.whatsapp);
  const marcar = (id: string) => setEnviados((s) => new Set(s).add(id));

  return (
    <>
      <Boton
        variante="secundario"
        icono={<BellRing className="size-4" />}
        onClick={() => abrir(false)}
        disabled={asignados === 0}
        title={asignados === 0 ? 'Nadie usa esta cuenta todavía.' : undefined}
      >
        Avisar datos
      </Boton>
      {abierto && (
        <Dialogo
          titulo={despues ? 'Avisar datos nuevos' : 'Avisar datos de la cuenta'}
          icono={<BellRing className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={() => setAbierto(false)}
          bloquear={cargando}
          ancho="max-w-2xl"
        >
          {despues && (
            <Alerta tono="info">
              Cambiaste la contraseña de esta cuenta. Elige a quién avisar y por dónde.
            </Alerta>
          )}
          {!datos ? (
            <>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">A quién</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Opcion
                    nombre="incluir"
                    valor="activos"
                    actual={incluir}
                    onElegir={() => setIncluir('activos')}
                  >
                    Solo activos
                  </Opcion>
                  <Opcion
                    nombre="incluir"
                    valor="todos"
                    actual={incluir}
                    onElegir={() => setIncluir('todos')}
                  >
                    Todos (incluye vencidos)
                  </Opcion>
                </div>
              </fieldset>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nota extra para todos (opcional)</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.currentTarget.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Ej.: si ve un aviso de dispositivo nuevo, acéptelo."
                  className="w-full rounded-xl border border-borde bg-hundida p-3 text-sm"
                />
              </label>
              <p className="text-xs text-tinta-tenue">
                Arma un mensaje por cliente con el correo, la clave y su perfil o cupo. Nada se
                envía solo. Queda registrado como ver credenciales.
              </p>
              {error && <Alerta tono="peligro">{error}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={() => setAbierto(false)} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton cargando={cargando} onClick={() => void armar()}>
                  Armar mensajes
                </Boton>
              </div>
            </>
          ) : lista.length === 0 && datos.avisos.length === 0 ? (
            <>
              <Alerta tono="info">No hay clientes que avisar en esta cuenta.</Alerta>
              <div className="flex justify-end">
                <Boton variante="fantasma" onClick={() => setAbierto(false)}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {avisados} de {lista.length} avisados
                  </span>
                  <BotonCopiar
                    texto={lista.map((a) => `— ${a.cliente.nombre}\n${a.texto}`).join('\n\n')}
                    que="todos los mensajes"
                  />
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-hundida"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={lista.length}
                  aria-valuenow={avisados}
                  aria-label="Avisados"
                >
                  <div
                    className="h-full bg-cian transition-[width]"
                    style={{ width: `${lista.length ? (avisados / lista.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <ul className="grid gap-2">
                {datos.avisos.map((a) => (
                  <Fila
                    key={a.perfilId}
                    aviso={a}
                    incluido={!fuera.has(a.perfilId)}
                    enviado={enviados.has(a.perfilId)}
                    onIncluir={(v) =>
                      setFuera((s) => {
                        const n = new Set(s);
                        if (v) n.delete(a.perfilId);
                        else n.add(a.perfilId);
                        return n;
                      })
                    }
                    onEnviado={() => marcar(a.perfilId)}
                  />
                ))}
              </ul>
              <p className="text-xs text-tinta-tenue">
                WhatsApp se abre con el mensaje escrito: revísalo y envíalo tú. En Telegram el
                mensaje se copia y se abre el chat para pegarlo.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={() => setAbierto(false)}>
                  Cerrar
                </Boton>
                {siguiente && (
                  <a
                    href={siguiente.whatsapp ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => marcar(siguiente.perfilId)}
                    className="inline-flex items-center gap-1.5 rounded-[0.875rem] bg-marca px-4 py-2 text-sm font-semibold text-white"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    Enviar uno por uno (
                    {lista.filter((a) => !enviados.has(a.perfilId) && a.whatsapp).length})
                  </a>
                )}
              </div>
            </>
          )}
        </Dialogo>
      )}
    </>
  );
}

/* ──────────────────────── Agregar cliente (alta) ──────────────────────── */

/** Lo que el alta necesita de la cuenta. */
export interface DatosAlta {
  servicioId: string;
  /** Próximo cobro de la cuenta («AAAA-MM-DD»): avisa si vence antes que el cliente. */
  facturaEn: string | null;
  /** Puede registrar el pago (entra en Caja). */
  puedeCobrar: boolean;
  /** Puede crear clientes nuevos. */
  puedeCrearCliente: boolean;
}

type Canal = 'whatsapp' | 'telegram' | 'correo';
const PASOS_ALTA = ['Lugar', 'Cliente', 'Plazo y precio'] as const;

/** «AAAA-MM-DD» más n meses (sin pasar del último día del mes). */
function sumarMeses(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const base = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}

/** Precio de un mes del plan en una moneda (los planes de días se pasan a 30 días). */
function precioMes(plan: PlanPublico, moneda: Moneda): string {
  const p = plan.precios[moneda]?.precio ?? (moneda === 'USD' ? plan.precioUsd : null);
  if (!p) return '';
  const meses = plan.duracionUnidad === 'mes' ? plan.duracionCantidad : plan.duracionCantidad / 30;
  return (Number(p) / Math.max(meses, 1 / 30)).toFixed(2);
}

/**
 * Agregar un cliente a un lugar libre en 3 pasos, como en el Gestor: el lugar
 * (y el correo del miembro si se une a un plan familiar), el cliente (uno que
 * ya está o uno nuevo con su canal) y el plazo con el precio. Con «Pagó con»
 * la venta entra en Caja; al terminar se abre el mensaje con los datos.
 */
export function AltaPerfil({
  cuentaId,
  perfil,
  tipo,
  datos,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  tipo: TipoPlataforma;
  datos: DatosAlta;
}) {
  const textos = TEXTOS_PLATAFORMA[tipo];
  const conMiembro = tipo === 'familiar' && !esTitular(tipo, perfil.numero);
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [hoy, setHoy] = useState('');
  // Paso 1
  const [lugar, setLugar] = useState('alquiler');
  const [usuarioMiembro, setUsuarioMiembro] = useState('');
  const [claveMiembro, setClaveMiembro] = useState('');
  // Paso 2
  const [modoCliente, setModoCliente] = useState('existente');
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<ClienteResumen[] | null>(null);
  const [clienteElegido, setClienteElegido] = useState<ClienteResumen | null>(null);
  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [contacto, setContacto] = useState('');
  const [aceptaWhatsapp, setAceptaWhatsapp] = useState(true);
  // Paso 3
  const [planes, setPlanes] = useState<PlanPublico[] | null>(null);
  const [metodos, setMetodos] = useState<MetodoCobroPublico[]>([]);
  const [planId, setPlanId] = useState('');
  const [plazo, setPlazo] = useState('1');
  const [fecha, setFecha] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [precio, setPrecio] = useState('');
  const [metodoId, setMetodoId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const campos = erroresPorCampo(error);

  const plan = planes?.find((p) => p.id === planId) ?? null;
  const exacta = plazo === 'fecha';
  const meses = exacta ? 1 : Number(plazo);
  const vence = exacta ? fecha : hoy ? sumarMeses(hoy, meses) : '';
  const total = Number(precio || 0) * meses;
  const metodosMoneda = metodos.filter((m) => m.moneda === moneda);
  const monedas = plan
    ? MONEDAS.filter((m) => plan.precios[m] || m === 'USD')
    : (['USD'] as Moneda[]);
  const cuentaAntes = Boolean(datos.facturaEn && vence && datos.facturaEn < vence);

  function elegirPlan(p: PlanPublico | undefined, m: Moneda) {
    setPlanId(p?.id ?? '');
    setPrecio(p ? precioMes(p, m) : '');
  }

  async function buscarClientes(texto: string) {
    const q = new URLSearchParams({ porPagina: '8' });
    if (texto.trim()) q.set('busqueda', texto.trim());
    const r = await llamarApi<{ elementos: ClienteResumen[] }>('GET', `/clientes?${q}`);
    setClientes(r.ok ? r.datos.elementos : []);
  }

  async function abrir() {
    setAbierto(true);
    setPaso(0);
    setError(null);
    setHoy(claveDia(new Date().toISOString()));
    void buscarClientes('');
    const [rp, rm] = await Promise.all([
      llamarApi<PlanPublico[]>('GET', `/catalogo/planes?servicioId=${datos.servicioId}`),
      datos.puedeCobrar
        ? llamarApi<MetodoCobroPublico[]>('GET', '/pagos/metodos')
        : Promise.resolve(null),
    ]);
    const lista = rp.ok ? rp.datos.filter((p) => p.activo && p.tipo === 'suscripcion') : [];
    setPlanes(lista);
    if (rm?.ok) setMetodos(rm.datos);
    elegirPlan(lista[0], 'USD');
  }

  function cerrar() {
    setAbierto(false);
    setClienteElegido(null);
    setNombre('');
    setContacto('');
    setUsuarioMiembro('');
    setClaveMiembro('');
    setReferencia('');
    setMetodoId('');
  }

  function puedeSeguir(): string | null {
    if (paso === 0 && conMiembro && lugar === 'plan' && !usuarioMiembro.trim()) {
      return 'Escribe el correo con el que el cliente se une al plan.';
    }
    if (paso === 1) {
      if (modoCliente === 'existente' && !clienteElegido) return 'Elige un cliente de la lista.';
      if (modoCliente === 'nuevo' && !nombre.trim()) return 'Escribe el nombre del cliente.';
    }
    return null;
  }

  async function guardar() {
    setCargando(true);
    setError(null);
    const valor = contacto.trim();
    const r = await llamarApi<ResultadoAltaPerfil>(
      'POST',
      `/cuentas/${cuentaId}/perfiles/${perfil.id}/alta`,
      {
        ...(modoCliente === 'existente'
          ? { clienteId: clienteElegido?.id }
          : {
              clienteNuevo: {
                nombre: nombre.trim(),
                ...(valor && canal === 'whatsapp' ? { whatsapp: valor, aceptaWhatsapp } : {}),
                ...(valor && canal === 'telegram' ? { telegram: valor } : {}),
                ...(valor && canal === 'correo' ? { correo: valor } : {}),
              },
            }),
        planId,
        ...(exacta ? { vence: fecha } : { meses }),
        precio: precio || '0',
        moneda,
        ...(metodoId ? { metodoCobroId: metodoId } : {}),
        ...(metodoId && referencia.trim() ? { referenciaExterna: referencia.trim() } : {}),
        ...(conMiembro && lugar === 'plan'
          ? {
              usuarioMiembro: usuarioMiembro.trim(),
              ...(claveMiembro ? { claveMiembro } : {}),
            }
          : {}),
      },
    );
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      const c = Object.keys(r.error.campos ?? {});
      if (c.some((k) => k.startsWith('clienteNuevo') || k === 'clienteId')) setPaso(1);
      else if (c.some((k) => k.includes('Miembro'))) setPaso(0);
      return;
    }
    // El mensaje con los datos se abre solo al refrescar (si hay permiso para verlo).
    recienAsignados.add(perfil.id);
    cerrar();
    router.refresh();
  }

  const aviso = puedeSeguir();
  const campoClase = 'h-10 w-full rounded-xl border border-borde bg-hundida px-3 text-sm';

  return (
    <>
      <Boton
        tamano="sm"
        icono={<UserPlus className="size-3.5" />}
        onClick={() => void abrir()}
        aria-label={`Agregar cliente a ${perfil.nombre}`}
      >
        Agregar cliente
      </Boton>
      {abierto && (
        <Dialogo
          titulo={`Agregar cliente a ${perfil.nombre}`}
          icono={<UserPlus className="size-5 text-marca" aria-hidden="true" />}
          onCerrar={cerrar}
          bloquear={cargando}
        >
          <ol className="flex flex-wrap gap-2 text-xs" aria-label="Pasos">
            {PASOS_ALTA.map((t, i) => (
              <li
                key={t}
                aria-current={i === paso ? 'step' : undefined}
                className={`rounded-full border px-2.5 py-1 ${
                  i === paso
                    ? 'border-cian bg-cian/10 font-semibold'
                    : i < paso
                      ? 'border-borde text-tinta-suave'
                      : 'border-borde text-tinta-tenue'
                }`}
              >
                {i + 1}. {t}
              </li>
            ))}
          </ol>

          {paso === 0 && (
            <div className="grid gap-3">
              <p className="text-sm text-tinta-suave">{textos.descripcion}</p>
              {conMiembro ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">¿Cómo entra el cliente?</legend>
                  <Opcion nombre="lugar" valor="alquiler" actual={lugar} onElegir={setLugar}>
                    Correo de alquiler: entra con los datos de la cuenta
                  </Opcion>
                  <Opcion nombre="lugar" valor="plan" actual={lugar} onElegir={setLugar}>
                    Unido a un plan: entra con su propio correo
                  </Opcion>
                  {lugar === 'plan' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        Correo del miembro
                        <input
                          value={usuarioMiembro}
                          onChange={(e) => setUsuarioMiembro(e.currentTarget.value)}
                          placeholder="correo.del.cliente@gmail.com"
                          autoComplete="off"
                          spellCheck={false}
                          className={campoClase}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Clave del miembro (opcional)
                        <input
                          type="password"
                          value={claveMiembro}
                          onChange={(e) => setClaveMiembro(e.currentTarget.value)}
                          autoComplete="new-password"
                          className={campoClase}
                        />
                      </label>
                      {(campos.usuarioMiembro || campos.claveMiembro) && (
                        <p className="text-xs text-peligro sm:col-span-2">
                          {campos.usuarioMiembro ?? campos.claveMiembro}
                        </p>
                      )}
                    </div>
                  )}
                </fieldset>
              ) : (
                <p className="rounded-xl border border-borde px-3 py-2 text-sm">
                  {perfil.nombre}
                  {esTitular(tipo, perfil.numero) ? ' · titular (correo de alquiler)' : ''}
                  {textos.usaPin
                    ? perfil.tienePin
                      ? ' · con PIN guardado'
                      : ' · sin PIN (puedes ponerlo en Editar)'
                    : ''}
                </p>
              )}
            </div>
          )}

          {paso === 1 && (
            <div className="grid gap-3">
              {datos.puedeCrearCliente && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Opcion
                    nombre="cliente"
                    valor="existente"
                    actual={modoCliente}
                    onElegir={setModoCliente}
                  >
                    Ya es cliente
                  </Opcion>
                  <Opcion
                    nombre="cliente"
                    valor="nuevo"
                    actual={modoCliente}
                    onElegir={setModoCliente}
                  >
                    Cliente nuevo
                  </Opcion>
                </div>
              )}
              {modoCliente === 'existente' ? (
                <div className="grid gap-2">
                  <form
                    role="search"
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void buscarClientes(busqueda);
                    }}
                  >
                    <input
                      aria-label="Buscar cliente"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.currentTarget.value)}
                      placeholder="Nombre, correo o teléfono"
                      className={`${campoClase} min-w-0 flex-1`}
                    />
                    <Boton tamano="sm" variante="secundario" type="submit">
                      Buscar
                    </Boton>
                  </form>
                  {clientes === null ? (
                    <p className="text-xs text-tinta-tenue">Cargando…</p>
                  ) : clientes.length === 0 ? (
                    <p className="text-xs text-tinta-tenue">No hay clientes con ese nombre.</p>
                  ) : (
                    <ul className="grid max-h-56 gap-1 overflow-y-auto">
                      {clientes.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            aria-pressed={clienteElegido?.id === c.id}
                            onClick={() => setClienteElegido(c)}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                              clienteElegido?.id === c.id
                                ? 'border-cian bg-cian/10'
                                : 'border-borde hover:border-cian'
                            }`}
                          >
                            <span className="block font-medium">{c.nombre}</span>
                            <span className="block text-xs text-tinta-tenue">
                              {c.correo ?? 'Sin correo'} · {c.suscripcionesActivas} activas
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <label className="grid gap-1 text-sm">
                    Nombre
                    <input
                      value={nombre}
                      onChange={(e) => setNombre(e.currentTarget.value)}
                      maxLength={120}
                      className={campoClase}
                    />
                  </label>
                  {campos['clienteNuevo.nombre'] && (
                    <p className="text-xs text-peligro">{campos['clienteNuevo.nombre']}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <label className="grid gap-1 text-sm">
                      Canal
                      <select
                        value={canal}
                        onChange={(e) => setCanal(e.currentTarget.value as Canal)}
                        className={campoClase}
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telegram">Telegram</option>
                        <option value="correo">Correo</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      {canal === 'whatsapp'
                        ? 'Número (con código de país)'
                        : canal === 'telegram'
                          ? 'Usuario de Telegram'
                          : 'Correo'}
                      <input
                        value={contacto}
                        onChange={(e) => setContacto(e.currentTarget.value)}
                        inputMode={
                          canal === 'whatsapp' ? 'tel' : canal === 'correo' ? 'email' : 'text'
                        }
                        placeholder={
                          canal === 'whatsapp'
                            ? '+58 414 1234567'
                            : canal === 'telegram'
                              ? '@usuario'
                              : 'cliente@gmail.com'
                        }
                        className={campoClase}
                      />
                    </label>
                  </div>
                  {(campos['clienteNuevo.whatsapp'] ||
                    campos['clienteNuevo.telegram'] ||
                    campos['clienteNuevo.correo']) && (
                    <p className="text-xs text-peligro">
                      {campos['clienteNuevo.whatsapp'] ??
                        campos['clienteNuevo.telegram'] ??
                        campos['clienteNuevo.correo']}
                    </p>
                  )}
                  {canal === 'whatsapp' && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={aceptaWhatsapp}
                        onChange={(e) => setAceptaWhatsapp(e.currentTarget.checked)}
                      />
                      Acepta recibir avisos por WhatsApp
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {paso === 2 && (
            <div className="grid gap-3">
              {planes && planes.length === 0 ? (
                <Alerta tono="aviso">
                  Este servicio no tiene planes de suscripción activos: crea uno en el catálogo.
                </Alerta>
              ) : (
                <label className="grid gap-1 text-sm">
                  Plan
                  <select
                    value={planId}
                    onChange={(e) =>
                      elegirPlan(
                        planes?.find((p) => p.id === e.currentTarget.value),
                        moneda,
                      )
                    }
                    className={campoClase}
                  >
                    {(planes ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Plazo</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MESES_ALTA.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={plazo === String(m)}
                      onClick={() => setPlazo(String(m))}
                      className={`rounded-xl border px-3 py-1.5 text-sm ${
                        plazo === String(m)
                          ? 'border-cian bg-cian/10 font-semibold'
                          : 'border-borde'
                      }`}
                    >
                      {m} {m === 1 ? 'mes' : 'meses'}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={exacta}
                    onClick={() => {
                      setPlazo('fecha');
                      if (!fecha && hoy) setFecha(sumarMeses(hoy, 1));
                    }}
                    className={`rounded-xl border px-3 py-1.5 text-sm ${
                      exacta ? 'border-cian bg-cian/10 font-semibold' : 'border-borde'
                    }`}
                  >
                    Fecha exacta
                  </button>
                </div>
                {exacta && (
                  <input
                    type="date"
                    aria-label="Vence el"
                    value={fecha}
                    min={hoy}
                    onChange={(e) => setFecha(e.currentTarget.value)}
                    className={`${campoClase} w-48`}
                  />
                )}
                {(campos.vence || campos.meses) && (
                  <p className="text-xs text-peligro">{campos.vence ?? campos.meses}</p>
                )}
                {vence && (
                  <p className="text-xs text-tinta-suave">Vence el {formatearDia(vence)}.</p>
                )}
                {cuentaAntes && datos.facturaEn && (
                  <Alerta tono="aviso">
                    La cuenta se cobra el {formatearDia(datos.facturaEn)}, antes de que venza este
                    cliente: recuerda renovarla.
                  </Alerta>
                )}
              </fieldset>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <label className="grid gap-1 text-sm">
                  Moneda
                  <select
                    value={moneda}
                    onChange={(e) => {
                      const m = e.currentTarget.value as Moneda;
                      setMoneda(m);
                      setMetodoId('');
                      if (plan) setPrecio(precioMes(plan, m));
                    }}
                    className={campoClase}
                  >
                    {monedas.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  {exacta ? 'Precio total' : 'Precio por mes'}
                  <input
                    value={precio}
                    inputMode="decimal"
                    onChange={(e) => setPrecio(e.currentTarget.value)}
                    className={campoClase}
                  />
                </label>
              </div>
              {campos.precio && <p className="text-xs text-peligro">{campos.precio}</p>}
              {datos.puedeCobrar && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Pagó con
                    <select
                      value={metodoId}
                      onChange={(e) => setMetodoId(e.currentTarget.value)}
                      className={campoClase}
                    >
                      <option value="">Todavía no (no entra en Caja)</option>
                      {metodosMoneda.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  {metodoId && (
                    <label className="grid gap-1 text-sm">
                      Referencia (opcional)
                      <input
                        value={referencia}
                        onChange={(e) => setReferencia(e.currentTarget.value)}
                        maxLength={80}
                        className={campoClase}
                      />
                    </label>
                  )}
                  {(campos.metodoCobroId || campos.referenciaExterna) && (
                    <p className="text-xs text-peligro sm:col-span-2">
                      {campos.metodoCobroId ?? campos.referenciaExterna}
                    </p>
                  )}
                </div>
              )}
              <p className="rounded-xl bg-hundida px-3 py-2 text-sm">
                Total:{' '}
                <strong>
                  {Number.isFinite(total) ? formatearMonto(total.toFixed(2), moneda) : '—'}
                </strong>
                {!exacta && meses > 1 ? ` (${meses} meses)` : ''}
                {metodoId ? ' · entra en Caja hoy' : ''}
              </p>
            </div>
          )}

          {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
          {error?.campos && paso === 2 && Object.keys(campos).length > 0 && (
            <Alerta tono="peligro">{error.mensaje}</Alerta>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {paso > 0 && (
              <Boton variante="fantasma" onClick={() => setPaso(paso - 1)} disabled={cargando}>
                Atrás
              </Boton>
            )}
            <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
              Cancelar
            </Boton>
            {paso < 2 ? (
              <Boton
                onClick={() => {
                  if (!aviso) setPaso(paso + 1);
                }}
                disabled={Boolean(aviso)}
                title={aviso ?? undefined}
              >
                Siguiente
              </Boton>
            ) : (
              <Boton
                cargando={cargando}
                disabled={!planId || (exacta && !fecha)}
                icono={<Check className="size-4" />}
                onClick={() => void guardar()}
              >
                Dar de alta
              </Boton>
            )}
          </div>
          {aviso && paso < 2 && <p className="text-right text-xs text-tinta-tenue">{aviso}</p>}
        </Dialogo>
      )}
    </>
  );
}
