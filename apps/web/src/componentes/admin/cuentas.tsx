'use client';

import {
  type CredencialesCuenta,
  type CuentaServicioDetalle,
  type MensajePerfil,
  ESTADOS_CUENTA_SERVICIO,
  ETIQUETA_ESTADO_CUENTA,
  MAX_PERFILES_CUENTA,
  type ModoCuenta,
  type PerfilCuentaPublico,
  type SuscripcionAsignable,
  TEXTOS_PLATAFORMA,
  type TipoPlataforma,
  esTitular,
} from '@nv/shared';
import {
  ChevronDown,
  ChevronUp,
  Dices,
  Eye,
  KeyRound,
  LifeBuoy,
  Link2,
  Mail,
  MessageCircle,
  MessageSquareText,
  Lock,
  Pencil,
  Plus,
  Search,
  Unlock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { clasesEntrada } from '@/componentes/ui/clases';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import { CICLOS_CUENTA, formatearFecha } from '@/lib/formato';
import {
  CampoFechaCobro,
  CampoMetodoPago,
  CampoPais,
  CampoPlan,
  CamposCredenciales,
  ResumenCuenta,
  pinsUnicos,
} from './cuenta-campos';
import {
  AltaPerfil,
  CortarPerfil,
  EliminarPerfil,
  type DatosAlta,
  MoverPerfil,
  pedirAvisoCuenta,
  recienAsignados,
} from './cuentas-gestor';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Campos comunes de alta y edición (sin credenciales). */
function camposDatos(d: FormData) {
  return {
    plan: textoDe(d, 'plan') ?? null,
    pais: textoDe(d, 'pais') ?? null,
    costoUsd: textoDe(d, 'costoUsd') ?? '0',
    cicloMeses: textoDe(d, 'cicloMeses') ?? '1',
    facturaEn: textoDe(d, 'facturaEn') ?? null,
    // Solo las cuentas sin anotar llevan fecha de liberación.
    ...(d.has('liberacionEn') ? { liberacionEn: textoDe(d, 'liberacionEn') ?? null } : {}),
    metodoPago: textoDe(d, 'metodoPago') ?? null,
    proveedor: textoDe(d, 'proveedor') ?? null,
    notas: textoDe(d, 'notas') ?? null,
  };
}

/** Valores que cambian el resumen de la derecha mientras se edita. */
interface ValoresCuenta {
  costoUsd: string;
  cicloMeses: number;
  facturaEn: string;
}

function DatosCuenta({
  campos,
  cuenta,
  conLiberacion = false,
  lateral,
}: {
  campos: Record<string, string>;
  cuenta?: CuentaServicioDetalle;
  /** Cuentas sin anotar: cuándo quedan libres para usarlas. */
  conLiberacion?: boolean;
  /** Resumen al lado (costo por perfil, margen…), con los valores en vivo. */
  lateral?: (v: ValoresCuenta) => ReactNode;
}) {
  const [costoUsd, setCostoUsd] = useState(cuenta?.costoUsd ?? '');
  const [cicloMeses, setCicloMeses] = useState(cuenta?.cicloMeses ?? 1);
  const [facturaEn, setFacturaEn] = useState(cuenta?.facturaEn ?? '');
  const datos = (
    <div className="grid content-start gap-5">
      {conLiberacion && (
        <Campo
          etiqueta="Fecha de liberación"
          name="liberacionEn"
          type="date"
          defaultValue={cuenta?.liberacionEn ?? ''}
          ayuda="Cuándo puedes empezar a usarla (fin del geobloqueo, espera del proveedor…)."
          error={campos.liberacionEn}
        />
      )}
      <CampoPlan inicial={cuenta?.plan ?? null} error={campos.plan} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoPais inicial={cuenta?.pais ?? null} error={campos.pais} />
        <Campo
          etiqueta="Proveedor (opcional)"
          name="proveedor"
          defaultValue={cuenta?.proveedor ?? ''}
          maxLength={120}
          placeholder="Dónde se compró"
          error={campos.proveedor}
        />
        <Campo
          etiqueta="Costo de cada cobro (USD)"
          name="costoUsd"
          inputMode="decimal"
          value={costoUsd}
          onChange={(e) => setCostoUsd(e.currentTarget.value)}
          placeholder="0.00"
          ayuda="Lo que te cuesta a ti."
          error={campos.costoUsd}
        />
        <Selector
          etiqueta="El proveedor cobra"
          name="cicloMeses"
          value={String(cicloMeses)}
          onChange={(e) => setCicloMeses(Number(e.currentTarget.value) || 1)}
          error={campos.cicloMeses}
        >
          {CICLOS_CUENTA.map(([meses, texto]) => (
            <option key={meses} value={meses}>
              {texto}
            </option>
          ))}
        </Selector>
      </div>
      <CampoFechaCobro valor={facturaEn} onCambio={setFacturaEn} error={campos.facturaEn} />
      <CampoMetodoPago inicial={cuenta?.metodoPago ?? null} error={campos.metodoPago} />
      <AreaTexto
        etiqueta="Notas (opcional)"
        name="notas"
        defaultValue={cuenta?.notas ?? ''}
        rows={2}
        maxLength={1000}
        ayuda="No escribas aquí claves ni PIN: van cifrados en sus campos."
        error={campos.notas}
      />
    </div>
  );
  if (!lateral) return datos;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      {datos}
      {lateral({ costoUsd, cicloMeses, facturaEn })}
    </div>
  );
}

/** Nombre y PIN de cada perfil al crear la cuenta (opcionales). */
function DatosPerfiles({ cantidad, campos }: { cantidad: number; campos: Record<string, string> }) {
  const errorPerfiles = Object.entries(campos).find(([k]) => k.startsWith('datosPerfiles'))?.[1];
  const [abierto, setAbierto] = useState(false);
  if (!abierto && !errorPerfiles) {
    return (
      <div>
        <Boton variante="fantasma" tamano="sm" onClick={() => setAbierto(true)}>
          Poner nombre y PIN a cada perfil (opcional)
        </Boton>
      </div>
    );
  }
  return (
    <fieldset className="grid gap-2 rounded-xl border border-borde p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">Perfiles: nombre y PIN</legend>
      <p className="text-xs text-tinta-tenue">
        Vacío: queda «Perfil N» sin PIN. El PIN son de 4 a 8 dígitos y se guarda cifrado.
      </p>
      {errorPerfiles && <p className="text-sm text-peligro">{errorPerfiles}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: cantidad }, (_, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_6.5rem] items-center gap-2">
            <span className="text-sm font-semibold text-tinta-tenue tabular-nums">{i + 1}</span>
            <input
              name={`perfil-nombre-${i}`}
              maxLength={40}
              placeholder={`Perfil ${i + 1}`}
              aria-label={`Nombre del perfil ${i + 1}`}
              className={clasesEntrada}
            />
            <input
              name={`perfil-pin-${i}`}
              inputMode="numeric"
              maxLength={8}
              placeholder="PIN"
              autoComplete="off"
              aria-label={`PIN del perfil ${i + 1}`}
              aria-invalid={campos[`datosPerfiles.${i}.pin`] ? true : undefined}
              className={clasesEntrada}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function leerDatosPerfiles(d: FormData, cantidad: number) {
  const lista = Array.from({ length: cantidad }, (_, i) => ({
    nombre: String(d.get(`perfil-nombre-${i}`) ?? '').trim(),
    pin: String(d.get(`perfil-pin-${i}`) ?? '').trim(),
  }));
  return lista.some((p) => p.nombre || p.pin) ? lista : undefined;
}

export function NuevaCuenta({
  servicios,
  enEspera = false,
  servicioFijo,
  modoInicial = 'perfiles',
  etiqueta,
}: {
  servicios: { id: string; nombre: string }[];
  /** Guardarla como «sin anotar»: en espera, sin asignar todavía. */
  enEspera?: boolean;
  /** Desde una plataforma: el servicio ya está elegido. */
  servicioFijo?: { id: string; nombre: string };
  /** Por perfiles (cuenta completa del Gestor) o un solo cupo (individual). */
  modoInicial?: ModoCuenta;
  /** Texto del botón que abre el formulario. */
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<ModoCuenta>(modoInicial);
  const [cantidad, setCantidad] = useState(5);
  const [usuarioNuevo, setUsuarioNuevo] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [creada, setCreada] = useState<string | null>(null);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const r = await ejecutar<CuentaServicioDetalle>('POST', '/cuentas', {
      servicioId: textoDe(d, 'servicioId') ?? '',
      usuario: textoDe(d, 'usuario') ?? '',
      clave: String(d.get('clave') ?? ''),
      modo,
      perfiles: modo === 'completa' ? 1 : (textoDe(d, 'perfiles') ?? ''),
      datosPerfiles: leerDatosPerfiles(d, modo === 'completa' ? 1 : cantidad),
      ...(enEspera ? { enEspera: true } : {}),
      ...camposDatos(d),
    });
    if (r) {
      setCreada(r.datos.pista);
      formulario.reset();
      setModo(modoInicial);
      setCantidad(5);
      setUsuarioNuevo('');
      setClaveNueva('');
    }
  }

  if (!abierto) {
    return (
      <Boton
        onClick={() => {
          setModo(modoInicial);
          setAbierto(true);
        }}
        icono={<Plus className="size-4" />}
      >
        {etiqueta ?? (enEspera ? 'Agregar cuenta sin anotar' : 'Nueva cuenta')}
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo={enEspera ? 'Cuenta sin anotar' : 'Nueva cuenta de servicio'}
      descripcion={
        enEspera
          ? 'Queda en espera, fuera del inventario, hasta que la anotes. El correo, la clave y los PIN se guardan cifrados.'
          : 'El correo, la clave y los PIN se guardan cifrados. En las listas solo se ve una pista del correo.'
      }
      onCerrar={() => {
        setAbierto(false);
        setCreada(null);
      }}
    >
      <form onSubmit={enviar} className="grid gap-5" noValidate autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector
            etiqueta="Servicio"
            name="servicioId"
            required
            error={campos.servicioId}
            defaultValue={servicioFijo?.id}
          >
            {!servicioFijo && <option value="">Elige un servicio</option>}
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta="Cómo se vende"
            name="modo"
            value={modo}
            onChange={(e) => setModo(e.currentTarget.value as ModoCuenta)}
          >
            <option value="perfiles">Por perfiles</option>
            <option value="completa">Cuenta completa</option>
          </Selector>
          {modo === 'perfiles' ? (
            <Campo
              etiqueta="Perfiles"
              name="perfiles"
              type="number"
              min={1}
              max={MAX_PERFILES_CUENTA}
              value={cantidad}
              onChange={(e) =>
                setCantidad(
                  Math.min(MAX_PERFILES_CUENTA, Math.max(1, Number(e.currentTarget.value) || 1)),
                )
              }
              required
              error={campos.perfiles}
            />
          ) : (
            <div className="grid content-start gap-1.5">
              <span className="text-sm font-medium">Perfiles</span>
              <p className="flex h-11 items-center rounded-xl border border-borde bg-hundida px-3.5 text-[0.95rem] text-tinta-suave">
                Un solo cupo
              </p>
            </div>
          )}
        </div>
        <CamposCredenciales
          usuario={usuarioNuevo}
          clave={claveNueva}
          onUsuario={setUsuarioNuevo}
          onClave={setClaveNueva}
          errores={{ usuario: campos.usuario, clave: campos.clave }}
          obligatorios
        />
        <DatosPerfiles cantidad={modo === 'completa' ? 1 : cantidad} campos={campos} />
        <DatosCuenta key={creada ?? 'nueva'} campos={campos} conLiberacion={enEspera} />
        <ErrorGeneral error={error} />
        {creada && !error && <Alerta tono="exito">Cuenta {creada} guardada.</Alerta>}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Guardar cuenta
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Un perfil en la ventana de edición: su orden y el PIN que se va a guardar. */
interface FilaPerfil {
  id: string;
  nombre: string;
  estado: PerfilCuentaPublico['estado'];
  tienePin: boolean;
  asignacion: PerfilCuentaPublico['asignacion'];
  /** PIN escrito (vacío: se conserva el actual). */
  pin: string;
  /** PIN actual, si se mostraron los datos. */
  pinActual: string;
}

export function EditarCuenta({
  cuenta,
  puedeRevelar = false,
}: {
  cuenta: CuentaServicioDetalle;
  /** Con `cuentas.revelar`: botón para ver y copiar el correo, la clave y los PIN actuales. */
  puedeRevelar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();
  const filasIniciales = () =>
    cuenta.listaPerfiles.map<FilaPerfil>((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado: p.estado,
      tienePin: p.tienePin,
      asignacion: p.asignacion,
      pin: '',
      pinActual: '',
    }));
  const [filas, setFilas] = useState<FilaPerfil[]>(filasIniciales);
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [actuales, setActuales] = useState<{ usuario: string; clave: string } | null>(null);
  const [mostrando, setMostrando] = useState(false);
  const [errorPrevio, setErrorPrevio] = useState<string | null>(null);
  // Responsable de cada cliente que usa un perfil (va en la ficha del cliente).
  const responsablesIniciales = () =>
    Object.fromEntries(
      cuenta.listaPerfiles
        .filter((p) => p.asignacion)
        .map((p) => [p.asignacion!.cliente.id, p.asignacion!.cliente.responsable ?? '']),
    ) as Record<string, string>;
  const [responsables, setResponsables] = useState<Record<string, string>>(responsablesIniciales);
  const [opcionesResponsable, setOpcionesResponsable] = useState<string[]>([]);
  const idListaResponsables = useId();
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState<'acceso' | 'perfiles' | 'cobro'>('acceso');

  function abrir() {
    setFilas(filasIniciales());
    setResponsables(responsablesIniciales());
    void llamarApi<string[]>('GET', '/clientes/responsables').then((r) => {
      if (r.ok) setOpcionesResponsable(r.datos);
    });
    setUsuario('');
    setClave('');
    setActuales(null);
    setErrorPrevio(null);
    setPestana('acceso');
    setAbierto(true);
    // Con permiso, los datos actuales se cargan solos: se edita encima, sin otro clic.
    if (puedeRevelar) void mostrarDatos();
  }

  async function mostrarDatos() {
    setMostrando(true);
    setErrorPrevio(null);
    const r = await llamarApi<CredencialesCuenta>('POST', `/cuentas/${cuenta.id}/revelar`, {});
    setMostrando(false);
    if (!r.ok) {
      setErrorPrevio(r.error.mensaje);
      return;
    }
    setActuales({ usuario: r.datos.usuario, clave: r.datos.clave });
    setUsuario(r.datos.usuario);
    setClave(r.datos.clave);
    const porNumero = new Map(cuenta.listaPerfiles.map((p) => [p.id, p.numero]));
    setFilas((lista) =>
      lista.map((f) => {
        const pin = r.datos.perfiles.find((p) => p.numero === porNumero.get(f.id))?.pin ?? '';
        return { ...f, pin: f.pin || pin, pinActual: pin };
      }),
    );
  }

  function mover(i: number, paso: -1 | 1) {
    setFilas((lista) => {
      const j = i + paso;
      if (j < 0 || j >= lista.length) return lista;
      const nueva = [...lista];
      [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
      return nueva;
    });
  }

  function pinsParaTodos() {
    const pins = pinsUnicos(filas.length);
    setFilas((lista) => lista.map((f, i) => ({ ...f, pin: pins[i]! })));
  }

  const ordenCambiado = filas.some((f, i) => f.id !== cuenta.listaPerfiles[i]?.id);
  const pinsNuevos = filas.filter((f) => f.pin && f.pin !== f.pinActual);
  const pinMalo = pinsNuevos.find((f) => !/^\d{4,8}$/.test(f.pin));

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setErrorPrevio(null);
    if (pinMalo) {
      setErrorPrevio(`El PIN de «${pinMalo.nombre}» son de 4 a 8 dígitos.`);
      return;
    }
    const usuarioNuevo =
      usuario.trim() && usuario.trim() !== actuales?.usuario ? usuario.trim() : '';
    const claveNueva = clave && clave !== actuales?.clave ? clave : '';
    setGuardando(true);
    // Primero el orden y los PIN (por perfil); luego los datos de la cuenta.
    if (ordenCambiado) {
      const r = await llamarApi('POST', `/cuentas/${cuenta.id}/perfiles/orden`, {
        perfilIds: filas.map((f) => f.id),
      });
      if (!r.ok) {
        setGuardando(false);
        setErrorPrevio(r.error.mensaje);
        return;
      }
    }
    for (const f of pinsNuevos) {
      const r = await llamarApi('PATCH', `/cuentas/${cuenta.id}/perfiles/${f.id}`, { pin: f.pin });
      if (!r.ok) {
        setGuardando(false);
        setErrorPrevio(`${f.nombre}: ${r.error.mensaje}`);
        return;
      }
    }
    const iniciales = responsablesIniciales();
    for (const [clienteId, valor] of Object.entries(responsables)) {
      if (valor.trim() === (iniciales[clienteId] ?? '').trim()) continue;
      const r = await llamarApi('PATCH', `/clientes/${clienteId}`, { responsable: valor.trim() });
      if (!r.ok) {
        setGuardando(false);
        setErrorPrevio(`Responsable: ${r.error.mensaje}`);
        return;
      }
    }
    setGuardando(false);
    const r = await ejecutar('PATCH', `/cuentas/${cuenta.id}`, {
      estado: textoDe(d, 'estado'),
      ...(cuenta.modo === 'perfiles' ? { perfiles: textoDe(d, 'perfiles') } : {}),
      // Vacíos o sin cambios: se conservan el correo y la clave actuales.
      ...(usuarioNuevo ? { usuario: usuarioNuevo } : {}),
      ...(claveNueva ? { clave: claveNueva } : {}),
      ...camposDatos(d),
    });
    if (!r) return;
    setAbierto(false);
    // Con correo, clave o PIN nuevos, se avisa a los que usan la cuenta.
    const asignadoConPin = pinsNuevos.some((f) => f.asignacion);
    if ((usuarioNuevo || claveNueva || asignadoConPin) && cuenta.perfiles.asignados > 0) {
      pedirAvisoCuenta(cuenta.id);
    }
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={abrir} icono={<Pencil className="size-4" />}>
        Editar cuenta
      </Boton>
    );
  }

  const asignados = filas.filter((f) => f.asignacion).length;
  const ingresoMensual = filas.reduce(
    (s, f) => s + (f.asignacion ? Number(f.asignacion.precioMensualUsd) || 0 : 0),
    0,
  );
  const textoTodo = actuales
    ? [
        `${cuenta.servicio.nombre}`,
        `Correo: ${usuario}`,
        `Clave: ${clave}`,
        ...filas.filter((f) => f.pin).map((f) => `${f.nombre}: PIN ${f.pin}`),
      ].join('\n')
    : '';

  const usuarioCambia = Boolean(usuario.trim()) && usuario.trim() !== (actuales?.usuario ?? '');
  const claveCambia = Boolean(clave) && clave !== (actuales?.clave ?? '');
  const responsablesAntes = responsablesIniciales();
  const responsableCambia = Object.entries(responsables).some(
    ([id, v]) => v.trim() !== (responsablesAntes[id] ?? '').trim(),
  );
  const resumenCambios = [
    usuarioCambia && 'correo',
    claveCambia && 'clave',
    ...pinsNuevos.map((f) => `PIN de ${f.nombre}`),
    ordenCambiado && 'orden de perfiles',
    responsableCambia && 'responsable',
  ].filter(Boolean) as string[];
  const errorEn = {
    acceso: Boolean(campos.usuario || campos.clave || campos.estado || campos.perfiles),
    perfiles: Boolean(pinMalo),
    cobro: Object.keys(campos).some((k) => !['usuario', 'clave', 'estado', 'perfiles'].includes(k)),
  };
  const pestanas = [
    ['acceso', 'Acceso'],
    ['perfiles', `Perfiles · ${filas.length}`],
    ['cobro', 'Cobro y datos'],
  ] as const;

  return (
    <PanelFormulario
      titulo="Editar cuenta"
      descripcion="Cambia solo lo que necesites y guarda. Lo demás se queda igual."
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-5" noValidate autoComplete="off">
        <div
          role="tablist"
          aria-label="Partes de la cuenta"
          className="flex gap-1 border-b border-borde"
        >
          {pestanas
            .filter(([clave]) => clave !== 'perfiles' || filas.length > 0)
            .map(([clave, nombre]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={pestana === clave}
                onClick={() => setPestana(clave)}
                className={
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ' +
                  (pestana === clave
                    ? 'border-marca text-marca'
                    : 'border-transparent text-tinta-suave hover:text-tinta')
                }
              >
                {nombre}
                {errorEn[clave] && (
                  <span className="size-2 rounded-full bg-peligro" aria-label="(revisar)" />
                )}
              </button>
            ))}
        </div>

        {/* Las tres partes siguen en el formulario aunque estén ocultas: se guarda todo junto. */}
        <div role="tabpanel" hidden={pestana !== 'acceso'} className="grid gap-4">
          {puedeRevelar && mostrando && !actuales && (
            <p className="text-sm text-tinta-tenue">Cargando los datos actuales…</p>
          )}
          {!puedeRevelar && (
            <p className="text-sm text-tinta-tenue">
              Deja vacíos el correo y la clave para conservarlos.
            </p>
          )}
          <CamposCredenciales
            usuario={usuario}
            clave={clave}
            onUsuario={setUsuario}
            onClave={setClave}
            errores={{ usuario: campos.usuario, clave: campos.clave }}
            obligatorios={false}
            pista={cuenta.pista}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector etiqueta="Estado" name="estado" defaultValue={cuenta.estado}>
              {ESTADOS_CUENTA_SERVICIO.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO_CUENTA[e]}
                </option>
              ))}
            </Selector>
            {cuenta.modo === 'perfiles' && (
              <Campo
                etiqueta="Cantidad de perfiles"
                name="perfiles"
                type="number"
                min={1}
                max={MAX_PERFILES_CUENTA}
                defaultValue={cuenta.perfiles.total}
                ayuda="Para quitar perfiles, deben estar libres los últimos."
                error={campos.perfiles}
              />
            )}
          </div>
          {textoTodo && (
            <div className="flex items-center gap-2">
              <BotonCopiar texto={textoTodo} que="todos los datos" />
              <span className="text-xs text-tinta-tenue">Correo, clave y PIN de cada perfil.</span>
            </div>
          )}
        </div>

        {filas.length > 0 && (
          <div role="tabpanel" hidden={pestana !== 'perfiles'} className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-tinta-tenue">
                Escribe encima del PIN para cambiarlo. Con las flechas cambias el orden.
              </p>
              <button type="button" className="chip" onClick={pinsParaTodos}>
                <Dices className="size-3.5" aria-hidden="true" /> PINs únicos para todos
              </button>
            </div>
            <div className="hidden grid-cols-[auto_7rem_minmax(0,1fr)_10rem_6.5rem] gap-x-3 px-2 text-xs font-semibold text-tinta-tenue sm:grid">
              <span className="w-[3.25rem]" />
              <span>Perfil</span>
              <span>Cliente · vence</span>
              <span>Responsable</span>
              <span>PIN</span>
            </div>
            <ul className="grid gap-2">
              {filas.map((f, i) => (
                <li
                  key={f.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-2 rounded-lg border border-borde px-2 py-2 sm:grid-cols-[auto_7rem_minmax(0,1fr)_10rem_6.5rem]"
                >
                  <div className="flex items-center gap-0.5">
                    <span className="w-6 text-center text-sm font-semibold text-tinta-tenue tabular-nums">
                      {i + 1}
                    </span>
                    <div className="grid">
                      <button
                        type="button"
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-tinta-tenue hover:text-tinta disabled:opacity-30"
                        aria-label={`Subir ${f.nombre}`}
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(i, 1)}
                        disabled={i === filas.length - 1}
                        className="rounded p-0.5 text-tinta-tenue hover:text-tinta disabled:opacity-30"
                        aria-label={`Bajar ${f.nombre}`}
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{f.nombre}</p>
                    <p className="truncate text-xs text-tinta-tenue sm:hidden">
                      {f.asignacion ? f.asignacion.cliente.nombre : 'Libre'}
                    </p>
                  </div>
                  <p className="hidden min-w-0 truncate text-sm sm:block">
                    {f.asignacion ? (
                      <>
                        {f.asignacion.cliente.nombre}
                        {f.asignacion.venceEn && (
                          <span className="text-tinta-tenue">
                            {' '}
                            · {formatearFecha(f.asignacion.venceEn)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-tinta-tenue">
                        {f.estado === 'bloqueado' ? 'Bloqueado' : 'Libre'}
                      </span>
                    )}
                  </p>
                  <input
                    value={f.pin}
                    onChange={(e) => {
                      const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 8);
                      setFilas((lista) => lista.map((x) => (x.id === f.id ? { ...x, pin: v } : x)));
                    }}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    placeholder={f.tienePin ? '••••' : 'PIN'}
                    aria-label={`PIN de ${f.nombre}`}
                    aria-invalid={f.pin && !/^\d{4,8}$/.test(f.pin) ? true : undefined}
                    className={`${clasesEntrada} py-1.5 sm:order-last`}
                  />
                  {!f.asignacion && <span className="hidden sm:block" aria-hidden="true" />}
                  {f.asignacion && (
                    <label className="col-span-2 col-start-2 flex items-center gap-2 text-xs text-tinta-suave sm:order-none sm:col-span-1 sm:col-start-auto">
                      <span className="shrink-0 sm:sr-only">Responsable</span>
                      <input
                        value={responsables[f.asignacion.cliente.id] ?? ''}
                        onChange={(e) => {
                          const v = e.currentTarget.value.slice(0, 60);
                          const id = f.asignacion!.cliente.id;
                          setResponsables((r) => ({ ...r, [id]: v }));
                        }}
                        list={idListaResponsables}
                        maxLength={60}
                        autoComplete="off"
                        placeholder="Cliente, Felix Str.…"
                        aria-label={`Responsable de ${f.asignacion.cliente.nombre}`}
                        className={`${clasesEntrada} py-1 text-sm`}
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <datalist id={idListaResponsables}>
              {[...new Set(['Cliente', ...opcionesResponsable])].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <p className="text-xs text-tinta-tenue">
              El responsable es de la persona: cambia en todos sus perfiles.
            </p>
          </div>
        )}

        <div role="tabpanel" hidden={pestana !== 'cobro'}>
          <DatosCuenta
            campos={campos}
            cuenta={cuenta}
            conLiberacion={cuenta.estado === 'en_espera'}
            lateral={(v) => (
              <ResumenCuenta
                costoUsd={Number(v.costoUsd) || 0}
                cicloMeses={v.cicloMeses}
                total={filas.length}
                asignados={asignados}
                ingresoMensualUsd={ingresoMensual}
                facturaEn={v.facturaEn}
              />
            )}
          />
        </div>

        {errorPrevio && <Alerta tono="peligro">{errorPrevio}</Alerta>}
        <ErrorGeneral error={error} />
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-3 rounded-b-nv border-t border-borde bg-elevada/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
          <p className="min-w-0 flex-1 text-sm text-tinta-suave">
            {resumenCambios.length > 0 ? (
              <>
                <span className="font-semibold text-tinta">Vas a cambiar:</span>{' '}
                {resumenCambios.join(', ')}.
              </>
            ) : (
              'Sin cambios en el acceso ni en los perfiles.'
            )}
          </p>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
          <Boton type="submit" cargando={cargando || guardando}>
            Guardar cambios
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Pide confirmación, descifra y muestra las credenciales; se ocultan solas al minuto. */
export function VerCredenciales({ cuentaId }: { cuentaId: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<CredencialesCuenta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (abierto && d && !d.open) d.showModal();
  }, [abierto]);

  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => setDatos(null), 60_000);
    return () => clearTimeout(t);
  }, [datos]);

  async function mostrar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<CredencialesCuenta>('POST', `/cuentas/${cuentaId}/revelar`, {});
    setCargando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setDatos(r.datos);
    dialogo.current?.close();
  }

  if (datos) {
    return (
      <div className="grid w-full gap-3 rounded-xl border border-marca/25 bg-marca-suave/40 p-4">
        {(
          [
            ['Correo o usuario', datos.usuario, 'el correo'],
            ['Clave', datos.clave, 'la clave'],
          ] as const
        ).map(([etiqueta, valor, que]) => (
          <div key={etiqueta} className="grid gap-1.5">
            <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-2 font-mono text-sm break-all select-all">
                {valor}
              </code>
              <BotonCopiar texto={valor} que={que} />
            </div>
          </div>
        ))}
        {datos.perfiles.some((p) => p.pin) && (
          <ul className="grid gap-1 text-sm">
            {datos.perfiles
              .filter((p) => p.pin)
              .map((p) => (
                <li key={p.numero}>
                  {p.nombre}: <code className="font-mono select-all">{p.pin}</code>
                </li>
              ))}
          </ul>
        )}
        {datos.perfiles.some((p) => p.usuarioMiembro || p.claveMiembro) && (
          <div className="grid gap-2">
            <span className="text-xs font-medium text-tinta-suave">
              Correo y clave de cada miembro
            </span>
            <ul className="grid gap-2 text-sm">
              {datos.perfiles
                .filter((p) => p.usuarioMiembro || p.claveMiembro)
                .map((p) => (
                  <li
                    key={p.numero}
                    className="grid gap-1.5 rounded-lg border border-borde bg-superficie p-2"
                  >
                    <span className="font-medium">{p.nombre}</span>
                    <DatosMiembro usuario={p.usuarioMiembro} clave={p.claveMiembro} />
                  </li>
                ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-tinta-tenue">Se ocultan solas en un minuto.</p>
          <Boton tamano="sm" variante="fantasma" onClick={() => setDatos(null)}>
            Ocultar
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <>
      <Boton
        variante="secundario"
        icono={<KeyRound className="size-4" aria-hidden="true" />}
        onClick={() => setAbierto(true)}
      >
        Ver credenciales
      </Boton>
      {abierto && (
        <dialog
          ref={dialogo}
          aria-labelledby={`${ids}-titulo`}
          onClose={() => setAbierto(false)}
          onCancel={(e) => {
            if (cargando) e.preventDefault();
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-nv border border-borde bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/60"
        >
          <div className="grid gap-4 p-5 sm:p-6">
            <h2 id={`${ids}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5 text-marca" aria-hidden="true" />
              ¿Ver el correo, la clave y los PIN?
            </h2>
            <p className="text-sm text-tinta-suave">
              Asegúrate de que nadie más vea tu pantalla. Queda registrado quién y cuándo las vio.
            </p>
            {error && <Alerta tono="peligro">{error}</Alerta>}
            <div className="flex flex-wrap justify-end gap-2">
              <Boton
                variante="fantasma"
                onClick={() => dialogo.current?.close()}
                disabled={cargando}
              >
                Cancelar
              </Boton>
              <Boton
                autoFocus
                cargando={cargando}
                icono={<Eye className="size-4" aria-hidden="true" />}
                onClick={() => void mostrar()}
              >
                Ver
              </Boton>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}

/** Correo y clave propios del miembro de un cupo familiar, cada uno con su botón de copiar. */
function DatosMiembro({ usuario, clave }: { usuario: string | null; clave: string | null }) {
  return (
    <div className="grid gap-1.5">
      {(
        [
          ['Correo', usuario, 'el correo del miembro'],
          ['Clave', clave, 'la clave del miembro'],
        ] as const
      ).map(([etiqueta, valor, que]) => (
        <div key={etiqueta} className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="w-12 text-xs text-tinta-tenue">{etiqueta}</span>
          {valor ? (
            <>
              <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">{valor}</code>
              <BotonCopiar texto={valor} que={que} />
            </>
          ) : (
            <span className="text-xs text-tinta-tenue">Sin guardar</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** En «Editar» de un cupo familiar: descifra y muestra el correo y la clave guardados del miembro. */
function MiembroActual({ cuentaId, numero }: { cuentaId: string; numero: number }) {
  const [datos, setDatos] = useState<{ usuario: string | null; clave: string | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => setDatos(null), 60_000);
    return () => clearTimeout(t);
  }, [datos]);

  async function mostrar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<CredencialesCuenta>('POST', `/cuentas/${cuentaId}/revelar`, {});
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    const p = r.datos.perfiles.find((x) => x.numero === numero);
    setDatos({ usuario: p?.usuarioMiembro ?? null, clave: p?.claveMiembro ?? null });
  }

  if (datos) {
    return (
      <div className="grid gap-1.5 rounded-lg border border-marca/25 bg-marca-suave/40 p-2">
        <DatosMiembro usuario={datos.usuario} clave={datos.clave} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-tinta-tenue">Se ocultan solos en un minuto.</p>
          <Boton tamano="sm" variante="fantasma" onClick={() => setDatos(null)}>
            Ocultar
          </Boton>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando}
        onClick={() => void mostrar()}
        icono={<Eye className="size-3.5" aria-hidden="true" />}
      >
        Mostrar datos actuales
      </Boton>
      {error && <Alerta tono="peligro">{error}</Alerta>}
    </div>
  );
}

/** Busca suscripciones del mismo servicio sin perfil y asigna una al perfil. */
function AsignarPerfil({ cuentaId, perfil }: { cuentaId: string; perfil: PerfilCuentaPublico }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState<SuscripcionAsignable[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const { cargando, error, ejecutar } = useAccion();

  async function buscar(texto: string) {
    setErrorLista(null);
    const q = texto.trim() ? `?busqueda=${encodeURIComponent(texto.trim())}` : '';
    const r = await llamarApi<SuscripcionAsignable[]>(
      'GET',
      `/cuentas/${cuentaId}/suscripciones-asignables${q}`,
    );
    if (r.ok) setOpciones(r.datos);
    else setErrorLista(r.error.mensaje);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<Link2 className="size-3.5" />}
        onClick={() => {
          setAbierto(true);
          void buscar('');
        }}
        aria-label={`Asignar ${perfil.nombre}`}
      >
        Asignar
      </Boton>
    );
  }

  return (
    <div className="grid w-full max-w-sm gap-2 text-left">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(busqueda);
        }}
      >
        <label className="sr-only" htmlFor={`buscar-${perfil.id}`}>
          Buscar cliente
        </label>
        <input
          id={`buscar-${perfil.id}`}
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
          placeholder="Nombre del cliente"
          className="h-9 min-w-0 flex-1 rounded-xl border border-borde bg-hundida px-3 text-sm"
        />
        <Boton tamano="sm" variante="secundario" type="submit" aria-label="Buscar">
          <Search className="size-3.5" />
        </Boton>
      </form>
      {errorLista && <p className="text-xs text-peligro">{errorLista}</p>}
      {opciones && opciones.length === 0 && (
        <p className="text-xs text-tinta-tenue">
          No hay suscripciones de este servicio sin perfil.
        </p>
      )}
      {opciones && opciones.length > 0 && (
        <ul className="grid max-h-56 gap-1 overflow-y-auto">
          {opciones.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={cargando}
                onClick={() => {
                  recienAsignados.add(perfil.id);
                  void ejecutar('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/asignar`, {
                    suscripcionId: s.id,
                  }).then((r) => {
                    if (!r) recienAsignados.delete(perfil.id);
                  });
                }}
                className="w-full rounded-lg border border-borde px-3 py-2 text-left text-sm hover:border-cian disabled:opacity-55"
              >
                <span className="block font-medium">{s.cliente.nombre}</span>
                <span className="block text-xs text-tinta-tenue">
                  {s.plan.nombre}
                  {s.venceEn ? ` · vence el ${formatearFecha(s.venceEn)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-peligro">{error.mensaje}</p>}
      <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
        Cancelar
      </Boton>
    </div>
  );
}

/** Acciones de un perfil: asignar, liberar, bloquear y cambiar nombre o PIN. */
/** Arma el mensaje con los datos del perfil. Nada se envía solo: se copia o se abre la app. */
export function ArmarMensaje({
  cuentaId,
  perfil,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [abierto, setAbierto] = useState(() => recienAsignados.has(perfil.id));
  const [mensaje, setMensaje] = useState<MensajePerfil | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (abierto && d && !d.open) d.showModal();
  }, [abierto]);

  // Recién asignado: se abre solo para enviarle los datos (el contrato) al cliente.
  useEffect(() => {
    recienAsignados.delete(perfil.id);
  }, [perfil.id]);

  async function armar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<MensajePerfil>(
      'POST',
      `/cuentas/${cuentaId}/perfiles/${perfil.id}/mensaje`,
      {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error.mensaje);
    setMensaje(r.datos);
  }

  const claseEnlaceBoton =
    'inline-flex items-center gap-1.5 rounded-[0.875rem] border border-borde-fuerte px-3 py-1.5 text-sm font-semibold hover:border-cian';

  return (
    <>
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<MessageSquareText className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Armar mensaje de ${perfil.nombre}`}
      >
        Mensaje
      </Boton>
      {abierto && (
        <dialog
          ref={dialogo}
          aria-labelledby={`${ids}-titulo`}
          onClose={() => {
            setAbierto(false);
            setMensaje(null);
            setError(null);
          }}
          onCancel={(e) => {
            if (cargando) e.preventDefault();
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-nv border border-borde bg-elevada p-0 text-left text-tinta shadow-nv backdrop:bg-black/60"
        >
          <div className="grid gap-4 p-5 sm:p-6">
            <h2 id={`${ids}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareText className="size-5 text-marca" aria-hidden="true" />
              Mensaje para {perfil.asignacion?.cliente.nombre ?? 'el cliente'}
            </h2>
            {!mensaje ? (
              <>
                <p className="text-sm text-tinta-suave">
                  Arma un mensaje con los datos de acceso
                  {perfil.tienePin ? ' (con el PIN)' : ''} para enviarlo tú. Nada se envía solo.
                  Queda registrado como ver credenciales.
                </p>
                {error && <Alerta tono="peligro">{error}</Alerta>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Boton
                    variante="fantasma"
                    onClick={() => dialogo.current?.close()}
                    disabled={cargando}
                  >
                    Cancelar
                  </Boton>
                  <Boton autoFocus cargando={cargando} onClick={() => void armar()}>
                    Armar mensaje
                  </Boton>
                </div>
              </>
            ) : (
              <>
                <textarea
                  readOnly
                  value={mensaje.texto}
                  rows={9}
                  aria-label="Mensaje"
                  className="w-full resize-y rounded-xl border border-borde bg-superficie p-3 font-mono text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <BotonCopiar texto={mensaje.texto} que="el mensaje" />
                  {mensaje.whatsapp && (
                    <a
                      href={mensaje.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={claseEnlaceBoton}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      Abrir WhatsApp
                    </a>
                  )}
                  {mensaje.telegram && (
                    <a
                      href={`https://t.me/${mensaje.telegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={claseEnlaceBoton}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      Abrir Telegram
                    </a>
                  )}
                  {mensaje.correo && (
                    <a href={mensaje.correo} className={claseEnlaceBoton}>
                      <Mail className="size-4" aria-hidden="true" />
                      Abrir correo
                    </a>
                  )}
                </div>
                <p className="text-xs text-tinta-tenue">
                  {mensaje.whatsapp
                    ? 'WhatsApp se abre con el mensaje escrito: revísalo y envíalo tú.'
                    : 'Sin enlace de WhatsApp: el cliente no tiene un WhatsApp con permiso para recibir mensajes. Cópialo y envíalo por donde te escribe.'}
                </p>
                <div className="flex justify-end">
                  <Boton variante="fantasma" onClick={() => dialogo.current?.close()}>
                    Cerrar
                  </Boton>
                </div>
              </>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}

export function AccionesPerfil({
  cuentaId,
  perfil,
  cuentaActiva,
  puedeRevelar = false,
  tipo = 'perfiles',
  otrosActivos = 0,
  alta,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  cuentaActiva: boolean;
  /** Con `cuentas.revelar`: puede armar el mensaje con los datos del perfil. */
  puedeRevelar?: boolean;
  /** Por perfiles, plan familiar o correo con código. */
  tipo?: TipoPlataforma;
  /** Clientes vigentes en los otros perfiles de la cuenta (para avisar tras un corte). */
  otrosActivos?: number;
  /** Con permiso de crear suscripciones: «Agregar cliente» en 3 pasos. */
  alta?: DatosAlta | undefined;
}) {
  const textos = TEXTOS_PLATAFORMA[tipo];
  const conMiembro = tipo === 'familiar' && !esTitular(tipo, perfil.numero);
  const [editando, setEditando] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();
  const ruta = `/cuentas/${cuentaId}/perfiles/${perfil.id}`;

  if (editando) {
    return (
      <form
        className="grid w-full max-w-sm gap-2 text-left"
        noValidate
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const pin = textoDe(d, 'pin');
          const miembro = textoDe(d, 'usuarioMiembro');
          const claveMiembro = String(d.get('claveMiembro') ?? '');
          const r = await ejecutar('PATCH', ruta, {
            nombre: textoDe(d, 'nombre'),
            nota: String(d.get('nota') ?? '').trim() || null,
            ...(d.get('quitarPin') === 'on' ? { pin: null } : pin ? { pin } : {}),
            ...(d.get('quitarMiembro') === 'on'
              ? { usuarioMiembro: null, claveMiembro: null }
              : {
                  ...(miembro ? { usuarioMiembro: miembro } : {}),
                  ...(claveMiembro ? { claveMiembro } : {}),
                }),
          });
          if (r) setEditando(false);
        }}
      >
        <Campo
          etiqueta="Nombre"
          name="nombre"
          defaultValue={perfil.nombre}
          maxLength={40}
          error={campos.nombre}
        />
        {textos.usaPin && (
          <Campo
            etiqueta={perfil.tienePin ? 'Nuevo PIN' : 'PIN (opcional)'}
            name="pin"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            error={campos.pin}
          />
        )}
        {perfil.tienePin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="quitarPin" /> Quitar el PIN
          </label>
        )}
        {conMiembro && (
          <>
            {perfil.tieneMiembro && puedeRevelar && (
              <MiembroActual cuentaId={cuentaId} numero={perfil.numero} />
            )}
            <Campo
              etiqueta={perfil.tieneMiembro ? 'Nuevo correo del miembro' : 'Correo del miembro'}
              name="usuarioMiembro"
              autoComplete="off"
              spellCheck={false}
              placeholder="correo.del.miembro@gmail.com"
              ayuda="Unido a un plan: el cliente entra con su propio correo y le llega la invitación."
              error={campos.usuarioMiembro}
            />
            <Campo
              etiqueta="Clave del miembro"
              name="claveMiembro"
              type="password"
              autoComplete="new-password"
              ayuda={perfil.tieneMiembro ? 'Vacía: se conserva la guardada.' : undefined}
              error={campos.claveMiembro}
            />
            {perfil.tieneMiembro && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="quitarMiembro" /> Quitar el correo del miembro (pasa a
                alquiler)
              </label>
            )}
          </>
        )}
        <Campo
          etiqueta="Nota (opcional)"
          name="nota"
          defaultValue={perfil.nota ?? ''}
          maxLength={120}
          placeholder="TV de la sala"
          error={campos.nota}
        />
        <ErrorGeneral error={error} />
        <div className="flex gap-2">
          <Boton tamano="sm" type="submit" cargando={cargando}>
            Guardar
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {perfil.estado === 'libre' && cuentaActiva && alta && (
          <AltaPerfil cuentaId={cuentaId} perfil={perfil} tipo={tipo} datos={alta} />
        )}
        {perfil.estado === 'libre' && cuentaActiva && (
          <AsignarPerfil cuentaId={cuentaId} perfil={perfil} />
        )}
        {perfil.estado === 'asignado' &&
          puedeRevelar &&
          cuentaActiva &&
          perfil.asignacion &&
          ['activa', 'en_gracia'].includes(perfil.asignacion.estado) && (
            <ArmarMensaje cuentaId={cuentaId} perfil={perfil} />
          )}
        {perfil.estado === 'asignado' && !perfil.asignacion?.terminada && (
          <MoverPerfil cuentaId={cuentaId} perfil={perfil} tipo={tipo} />
        )}
        {perfil.estado === 'asignado' && (
          <CortarPerfil
            cuentaId={cuentaId}
            perfil={perfil}
            tipo={tipo}
            otrosActivos={otrosActivos}
          />
        )}
        {perfil.estado === 'asignado' && <EliminarPerfil perfil={perfil} tipo={tipo} />}
        {(perfil.estado === 'libre' || perfil.estado === 'respaldo') && (
          <Boton
            tamano="sm"
            variante="fantasma"
            cargando={cargando}
            icono={<LifeBuoy className="size-3.5" />}
            onClick={() => void ejecutar('PATCH', ruta, { respaldo: perfil.estado !== 'respaldo' })}
            aria-label={`${perfil.estado === 'respaldo' ? 'Quitar de respaldo' : 'Guardar de respaldo'} ${perfil.nombre}`}
            title="Un perfil de respaldo se usa primero para reponer a los clientes de una cuenta caída."
          >
            {perfil.estado === 'respaldo' ? 'Quitar respaldo' : 'Respaldo'}
          </Boton>
        )}
        {perfil.estado !== 'asignado' && (
          <Boton
            tamano="sm"
            variante="fantasma"
            cargando={cargando}
            icono={
              perfil.estado === 'bloqueado' ? (
                <Unlock className="size-3.5" />
              ) : (
                <Lock className="size-3.5" />
              )
            }
            onClick={() =>
              void ejecutar('PATCH', ruta, { bloqueado: perfil.estado !== 'bloqueado' })
            }
            aria-label={`${perfil.estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'} ${perfil.nombre}`}
          >
            {perfil.estado === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}
          </Boton>
        )}
        <Boton
          tamano="sm"
          variante="fantasma"
          icono={<Pencil className="size-3.5" />}
          onClick={() => setEditando(true)}
          aria-label={`Editar ${perfil.nombre}`}
        >
          Editar
        </Boton>
      </div>
      {error && <p className="max-w-56 text-right text-xs text-peligro">{error.mensaje}</p>}
    </div>
  );
}

/** Una cuenta completa pasa a venderse por perfiles; quien la tenga queda en el perfil 1. */
export function PasarAIndividuales({ cuentaId }: { cuentaId: string }) {
  const router = useRouter();
  const [perfiles, setPerfiles] = useState('4');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    const r = await llamarApi('POST', `/cuentas/${cuentaId}/individuales`, { perfiles });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="flex flex-wrap items-end gap-3 border-t border-borde px-5 py-4 sm:px-6"
    >
      <Campo
        etiqueta="Pasar a perfiles individuales"
        ayuda="Quien tenga la cuenta queda en el perfil 1; los demás quedan libres para vender."
        type="number"
        min={2}
        max={20}
        value={perfiles}
        onChange={(e) => setPerfiles(e.currentTarget.value)}
        className="w-44"
      />
      <Boton type="submit" variante="secundario" cargando={ocupado}>
        Pasar a individuales
      </Boton>
      {error && <p className="w-full text-sm text-peligro">{error}</p>}
    </form>
  );
}
