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
  Copy,
  Mail,
  MessageCircle,
  Scissors,
  Send,
  Trash2,
  UserPlus,
  Wand2,
  X,
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
        <div className="flex items-start gap-3">
          <h2 id={`${id}-titulo`} className="flex flex-1 items-center gap-2 text-lg font-semibold">
            {icono}
            {titulo}
          </h2>
          {!bloquear && (
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar ventana"
              title="Cerrar"
              className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

const claseEnlaceBoton =
  'inline-flex items-center gap-1.5 rounded-[0.875rem] border border-borde-fuerte px-3 py-1.5 text-sm font-semibold hover:border-cian';

export function Opcion({
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
  const [motivo, setMotivo] = useState('');
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const router = useRouter();
  const campos = erroresPorCampo(error);
  const textos = TEXTOS_PLATAFORMA[tipo];
  const terminada = perfil.asignacion?.terminada ?? false;
  // Cortar a quien aún no vence pide el motivo: el cliente lo ve como «Suspendida por…».
  const a = perfil.asignacion;
  const vigente =
    !!a &&
    (a.estado === 'activa' || a.estado === 'en_gracia') &&
    (!a.venceEn || claveDia(a.venceEn) > claveDia(new Date().toISOString()));
  // Miembro de un plan familiar con su correo: el cupo lo conserva y la clave nueva es la suya.
  const miembro = tipo === 'familiar' && !esTitular(tipo, perfil.numero) && perfil.tieneMiembro;

  function cerrar() {
    if (listo) router.refresh();
    setAbierto(false);
    setListo(false);
    setModoClave('misma');
    setModoPin('mismo');
    setClave('');
    setPin('');
    setMotivo('');
  }

  async function confirmar() {
    const claveNueva = modoClave === 'nueva' ? clave.trim() : '';
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/liberar`, {
      ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      ...(claveNueva ? { nuevaClave: claveNueva } : {}),
      ...(modoPin === 'nuevo' && pin.trim() ? { nuevoPin: pin.trim() } : {}),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    // El aviso se pide antes de refrescar: al refrescar, este perfil queda libre y su botón se va.
    if (claveNueva && !miembro && avisar && otrosActivos > 0) {
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
                {miembro ? ' y conserva el correo del miembro' : ''}
                {modoClave === 'nueva'
                  ? miembro
                    ? ', con la clave nueva del miembro guardada'
                    : ' y la cuenta tiene la clave nueva guardada'
                  : ''}
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
                {vigente
                  ? ' Todavía no vence: su suscripción queda suspendida y verá el motivo.'
                  : ' Su suscripción no cambia: si no pagó, márcala aparte.'}{' '}
                Hay {otrosActivos === 1 ? '1 persona más' : `${otrosActivos} personas más`} usando
                la cuenta.
              </p>
              {(vigente || campos.motivo) && (
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Motivo del corte</span>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.currentTarget.value)}
                    rows={2}
                    maxLength={300}
                    required
                    placeholder="Ej.: Compartió la cuenta con otras personas."
                    aria-invalid={campos.motivo ? true : undefined}
                    className="min-w-0 rounded-xl border border-borde bg-hundida px-3 py-2 text-sm"
                  />
                  <span className="text-xs text-tinta-tenue">
                    El cliente verá «Suspendida por: …» y su servicio deja de estar vigente.
                  </span>
                  {campos.motivo && <span className="text-xs text-peligro">{campos.motivo}</span>}
                </label>
              )}
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
                  {miembro
                    ? 'El cupo conserva el correo del miembro (para borrarlo usa «Eliminar»). La cuenta principal no cambia.'
                    : 'Cambiarla evita que el cliente cortado siga entrando. Cámbiala también en la plataforma. A los que siguen les avisamos solos (sin la clave).'}
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
              {modoClave === 'nueva' && !miembro && otrosActivos > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={avisar}
                    onChange={(e) => setAvisar(e.currentTarget.checked)}
                  />
                  Armar también el mensaje con la clave nueva para{' '}
                  {otrosActivos === 1 ? 'la persona que sigue' : `los ${otrosActivos} que siguen`}
                </label>
              )}
              {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton
                  cargando={cargando}
                  disabled={vigente && motivo.trim().length < 3}
                  onClick={() => void confirmar()}
                >
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

/* ─────────────────────────────── Eliminar ─────────────────────────────── */

/**
 * «Eliminar» del Gestor: el lugar queda libre, en un plan familiar se borra el
 * correo y la clave del miembro, y la suscripción se cancela. El cliente y su
 * historial se conservan. Se confirma escribiendo ELIMINAR.
 */
export function EliminarPerfil({
  perfil,
  tipo,
}: {
  perfil: PerfilCuentaPublico;
  tipo: TipoPlataforma;
}) {
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const router = useRouter();
  const textos = TEXTOS_PLATAFORMA[tipo];
  const miembro = tipo === 'familiar' && !esTitular(tipo, perfil.numero) && perfil.tieneMiembro;
  const a = perfil.asignacion;
  if (!a) return null;
  const confirmado = confirmacion.trim().toUpperCase() === 'ELIMINAR';

  function cerrar() {
    if (listo) router.refresh();
    setAbierto(false);
    setListo(false);
    setConfirmacion('');
    setError(null);
  }

  async function confirmar() {
    if (!confirmado || !a) return;
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/suscripciones/${a.suscripcionId}/eliminar-del-lugar`, {});
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
        aria-label={`Eliminar a ${a.cliente.nombre} de ${perfil.nombre}`}
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
                {a.cliente.nombre} salió de {perfil.nombre}
                {miembro ? ' y se borró el correo del miembro' : ''}. Su suscripción quedó
                cancelada; el cliente y su historial se conservan.
              </Alerta>
              <div className="flex justify-end">
                <Boton variante="fantasma" onClick={cerrar}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <Alerta tono="aviso">
                {miembro
                  ? 'A diferencia de «Cortar», se borra el correo y la clave del miembro de este cupo y su suscripción se cancela. No se puede deshacer.'
                  : `${perfil.nombre} queda libre y la suscripción de ${a.cliente.nombre} se cancela (se anulan sus facturas abiertas). No se puede deshacer.`}
              </Alerta>
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
              {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
              <div className="flex flex-wrap justify-end gap-2">
                <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
                  Cancelar
                </Boton>
                <Boton
                  variante="peligro"
                  cargando={cargando}
                  disabled={!confirmado}
                  onClick={() => void confirmar()}
                >
                  Eliminar {textos.lugar === 'Perfil' ? 'del perfil' : 'del cupo'}
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

type OpcionMover = 'perfil' | 'individual' | 'alquiler' | 'cupo' | 'correo_cliente';

/** Las opciones de «Mover» de cada tipo de plataforma, con sus nombres del Gestor. */
const OPCIONES_MOVER: Record<TipoPlataforma, { opcion: OpcionMover; nombre: string }[]> = {
  perfiles: [
    { opcion: 'perfil', nombre: 'Perfil de una cuenta completa' },
    { opcion: 'individual', nombre: 'Cuenta individual' },
  ],
  familiar: [
    { opcion: 'alquiler', nombre: 'Alquiler' },
    { opcion: 'cupo', nombre: 'Cupo de una cuenta principal' },
    { opcion: 'correo_cliente', nombre: 'Correo del cliente' },
  ],
  correo: [
    { opcion: 'alquiler', nombre: 'Alquiler' },
    { opcion: 'correo_cliente', nombre: 'Correo del cliente' },
  ],
};

/** Qué lugares libres de una cuenta sirven para cada opción. */
function lugaresPara(d: DestinoMover, opcion: OpcionMover, tipo: TipoPlataforma) {
  const individual = d.individual ?? d.modo === 'completa';
  return d.perfiles.filter((p) => {
    const titular = esTitular(tipo, p.numero);
    if (opcion === 'perfil') return !individual;
    if (opcion === 'individual') return individual;
    if (opcion === 'alquiler') return tipo === 'correo' || individual || titular;
    if (opcion === 'cupo') return !individual && !titular;
    return false;
  });
}

export function CopiarIcono({ valor, que }: { valor: string; que: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(valor)
          .then(() => {
            setListo(true);
            setTimeout(() => setListo(false), 1500);
          })
          .catch(() => undefined);
      }}
      aria-label={`Copiar ${que}`}
      title={`Copiar ${que}`}
      className="rounded-md p-1 text-tinta-tenue hover:text-tinta"
    >
      {listo ? <Check className="size-3.5 text-exito" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/**
 * «Mover» como en el Gestor: se ve dónde está ahora y, por opción, las cuentas
 * con lugares libres con su correo completo y sus perfiles o cupos libres.
 * - Alquiler: pasa solo el cliente (vencimiento, responsable y precio); su
 *   correo de miembro no viaja y el lugar donde estaba queda vacío.
 * - Cupo de una cuenta principal: con el correo del cliente unido al plan.
 * - Correo del cliente: se crea una cuenta individual con su correo.
 * Al terminar se abre el mensaje con los datos nuevos para enviárselo.
 */
export function MoverPerfil({
  cuentaId,
  perfil,
  tipo,
  servicioId,
  correoActual,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  tipo: TipoPlataforma;
  /** Para «Correo del cliente» (crear su cuenta individual). Sin él no se ofrece. */
  servicioId?: string | undefined;
  /** Correo de la cuenta donde está ahora (si se puede ver). */
  correoActual?: string | null | undefined;
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinos, setDestinos] = useState<DestinoMover[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [hoy, setHoy] = useState(0);
  const opciones = OPCIONES_MOVER[tipo].filter(
    (o) => o.opcion !== 'correo_cliente' || Boolean(servicioId),
  );
  const [opcion, setOpcion] = useState<OpcionMover>(opciones[0]!.opcion);
  const [correoCliente, setCorreoCliente] = useState('');
  const [claveCliente, setClaveCliente] = useState('');
  const [correoMiembro, setCorreoMiembro] = useState('');
  const [claveMiembro, setClaveMiembro] = useState('');
  const [errorCrear, setErrorCrear] = useState<ErrorLlamada | null>(null);
  const [creando, setCreando] = useState(false);
  const { cargando, error, ejecutar } = useAccion();
  const textos = TEXTOS_PLATAFORMA[tipo];
  const ocupado = cargando || creando;

  async function abrir() {
    setAbierto(true);
    setHoy(Date.now());
    setDestinos(null);
    setErrorLista(null);
    setElegido(null);
    setErrorCrear(null);
    setOpcion(opciones[0]!.opcion);
    const r = await llamarApi<DestinoMover[]>(
      'GET',
      `/cuentas/${cuentaId}/perfiles/${perfil.id}/destinos`,
    );
    if (r.ok) setDestinos(r.datos);
    else setErrorLista(r.error.mensaje);
  }

  async function moverA(destinoPerfilId: string, extra: Record<string, unknown>) {
    // El mensaje con los datos nuevos se abre solo al volver.
    recienAsignados.add(destinoPerfilId);
    const r = await ejecutar('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/mover`, {
      destinoPerfilId,
      ...extra,
    });
    if (r) setAbierto(false);
    else recienAsignados.delete(destinoPerfilId);
  }

  async function mover() {
    if (opcion === 'correo_cliente') {
      if (!servicioId) return;
      setCreando(true);
      setErrorCrear(null);
      const rc = await llamarApi<{ id: string; listaPerfiles: { id: string }[] }>(
        'POST',
        '/cuentas',
        {
          servicioId,
          usuario: correoCliente.trim(),
          clave: claveCliente || generarClave(16),
          modo: 'completa',
          perfiles: 1,
          proveedor: 'Correo del cliente',
          notas: 'Activación en el correo del cliente (no se le paga a un proveedor).',
        },
      );
      setCreando(false);
      if (!rc.ok) return setErrorCrear(rc.error);
      await moverA(rc.datos.listaPerfiles[0]!.id, { soloCliente: true });
      return;
    }
    if (!elegido) return;
    await moverA(
      elegido,
      opcion === 'alquiler'
        ? { soloCliente: true }
        : opcion === 'cupo' && correoMiembro.trim()
          ? {
              usuarioMiembro: correoMiembro.trim(),
              ...(claveMiembro ? { claveMiembro } : {}),
            }
          : {},
    );
  }

  const q = filtro.trim().toLowerCase();
  const visibles = (destinos ?? [])
    .map((d) => ({ d, libres: lugaresPara(d, opcion, tipo) }))
    .filter(
      ({ d, libres }) =>
        libres.length > 0 && (!q || (d.correo ?? d.pista).toLowerCase().includes(q)),
    );
  const contar = (o: OpcionMover) =>
    (destinos ?? []).reduce((n, d) => n + lugaresPara(d, o, tipo).length, 0);
  const dias = (f: string | null) =>
    f ? Math.round((new Date(`${f}T00:00:00Z`).getTime() - hoy) / 86_400_000) : null;
  const faltaMiembro =
    opcion === 'cupo' && !perfil.tieneMiembro && !correoMiembro.trim() && Boolean(elegido);
  const listo =
    opcion === 'correo_cliente'
      ? /^\S+@\S+\.\S+$/.test(correoCliente.trim())
      : Boolean(elegido) && !faltaMiembro;
  const ahora = `${correoActual ?? 'Esta cuenta'} · ${
    tipo === 'perfiles' ? `${textos.lugar} ${perfil.numero}` : perfil.nombre
  }${perfil.tieneMiembro ? ' · unido a un plan con su correo' : ''}`;

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
          bloquear={ocupado}
          ancho="max-w-2xl"
        >
          <div className="grid gap-1 rounded-xl border border-borde bg-hundida p-3 text-sm">
            <span className="text-xs text-tinta-tenue">Ahora está en</span>
            <span className="flex min-w-0 items-center gap-1 font-mono">
              <span className="truncate">{ahora}</span>
              {correoActual && !correoActual.includes('•') && (
                <CopiarIcono valor={correoActual} que="el correo actual" />
              )}
            </span>
          </div>
          <div role="radiogroup" aria-label="Adónde lo mueves" className="flex flex-wrap gap-2">
            {opciones.map((o) => {
              const n = o.opcion === 'correo_cliente' ? null : contar(o.opcion);
              return (
                <button
                  key={o.opcion}
                  type="button"
                  role="radio"
                  aria-checked={opcion === o.opcion}
                  onClick={() => {
                    setOpcion(o.opcion);
                    setElegido(null);
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-sm ${
                    opcion === o.opcion
                      ? 'border-marca bg-marca/15 font-semibold'
                      : 'border-borde hover:border-cian'
                  }`}
                >
                  {o.nombre}
                  {n !== null && destinos ? (
                    <span className="ml-1.5 rounded-full bg-hundida px-1.5 text-xs tabular-nums">
                      {n}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-tinta-suave">
            {opcion === 'alquiler'
              ? 'Pasa solo el cliente con su fecha de vencimiento, su responsable y su precio. Su correo y clave de miembro no se copian, y el lugar donde estaba queda vacío.'
              : opcion === 'cupo'
                ? 'Cupos libres de las cuentas principales. Entra con su propio correo unido al plan.'
                : opcion === 'correo_cliente'
                  ? 'Se crea una cuenta individual con el correo del cliente y pasa ahí con su vencimiento, responsable y precio. El lugar donde estaba queda vacío.'
                  : `Pasa con su suscripción y sus fechas. Donde estaba queda libre y cada ${textos.lugar.toLowerCase()} conserva su PIN. Primero las cuentas que vencen más tarde.`}
          </p>
          {opcion === 'correo_cliente' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Correo del cliente
                <input
                  type="email"
                  value={correoCliente}
                  onChange={(e) => setCorreoCliente(e.currentTarget.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="correo.del.cliente@gmail.com"
                  className="h-10 rounded-xl border border-borde bg-hundida px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Contraseña (opcional)
                <input
                  type="password"
                  value={claveCliente}
                  onChange={(e) => setClaveCliente(e.currentTarget.value)}
                  autoComplete="new-password"
                  className="h-10 rounded-xl border border-borde bg-hundida px-3"
                />
              </label>
              {errorCrear && (
                <Alerta tono="peligro" className="sm:col-span-2">
                  {errorCrear.mensaje}
                </Alerta>
              )}
            </div>
          ) : (
            <>
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
                  No hay {textos.lugares.toLowerCase()} libres para esta opción. Agrega una cuenta o
                  libera uno.
                </Alerta>
              )}
              <ul className="grid gap-2">
                {visibles.map(({ d, libres }) => {
                  const n = dias(d.facturaEn);
                  return (
                    <li key={d.cuentaId} className="grid gap-2 rounded-xl border border-borde p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1 font-mono font-medium">
                          <span className="truncate" title={d.correo ?? d.pista}>
                            {d.correo ?? d.pista}
                          </span>
                          {d.correo && <CopiarIcono valor={d.correo} que="el correo" />}
                        </span>
                        <span className="text-xs text-tinta-tenue">
                          {d.individual
                            ? tipo === 'perfiles'
                              ? 'Individual'
                              : 'De alquiler'
                            : `${libres.length} libre${libres.length === 1 ? '' : 's'} de ${d.total ?? '?'}`}
                          {d.plan ? ` · ${d.plan}` : ''}
                          {d.facturaEn
                            ? ` · vence ${formatearDia(d.facturaEn)}${n !== null ? ` (en ${n} días)` : ''}`
                            : ''}
                          {d.cuentaId === cuentaId ? ' · esta cuenta' : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {libres.map((p) => (
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
                            {d.individual
                              ? 'Cuenta entera'
                              : tipo === 'perfiles'
                                ? `${textos.lugar} ${p.numero}`
                                : esTitular(tipo, p.numero)
                                  ? `${textos.lugar} ${p.numero} (titular)`
                                  : `${textos.lugar} ${p.numero}`}
                            {p.respaldo ? ' · respaldo' : ''}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {opcion === 'cupo' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    {perfil.tieneMiembro
                      ? 'Otro correo para el plan (opcional)'
                      : 'Correo del cliente para el plan'}
                    <input
                      type="email"
                      value={correoMiembro}
                      onChange={(e) => setCorreoMiembro(e.currentTarget.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="correo.del.miembro@gmail.com"
                      className="h-10 rounded-xl border border-borde bg-hundida px-3"
                    />
                    {perfil.tieneMiembro && (
                      <span className="text-xs text-tinta-tenue">
                        Vacío: pasa con el correo que ya tiene.
                      </span>
                    )}
                  </label>
                  <label className="grid gap-1 text-sm">
                    Clave del miembro (opcional)
                    <input
                      type="password"
                      value={claveMiembro}
                      onChange={(e) => setClaveMiembro(e.currentTarget.value)}
                      autoComplete="new-password"
                      className="h-10 rounded-xl border border-borde bg-hundida px-3"
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {faltaMiembro && (
            <Alerta tono="aviso">Escribe el correo del cliente para unirlo al plan.</Alerta>
          )}
          {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setAbierto(false)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton cargando={ocupado} disabled={!listo} onClick={() => void mover()}>
              {listo
                ? 'Mover y armar mensaje'
                : opcion === 'correo_cliente'
                  ? 'Escribe el correo'
                  : 'Elige destino'}
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
