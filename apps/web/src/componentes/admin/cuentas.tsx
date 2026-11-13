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
} from '@nv/shared';
import {
  Eye,
  EyeOff,
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
  Unlink,
  Unlock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { clasesEntrada } from '@/componentes/ui/clases';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import { CICLOS_CUENTA, formatearFecha } from '@/lib/formato';
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

function DatosCuenta({
  campos,
  cuenta,
  conLiberacion = false,
}: {
  campos: Record<string, string>;
  cuenta?: CuentaServicioDetalle;
  /** Cuentas sin anotar: cuándo quedan libres para usarlas. */
  conLiberacion?: boolean;
}) {
  return (
    <>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Plan de la cuenta (opcional)"
          name="plan"
          defaultValue={cuenta?.plan ?? ''}
          placeholder="Premium 4 pantallas"
          maxLength={60}
          error={campos.plan}
        />
        <Selector
          etiqueta="El proveedor cobra"
          name="cicloMeses"
          defaultValue={String(cuenta?.cicloMeses ?? 1)}
          error={campos.cicloMeses}
        >
          {CICLOS_CUENTA.map(([meses, texto]) => (
            <option key={meses} value={meses}>
              {texto}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Costo de cada cobro (USD)"
          name="costoUsd"
          inputMode="decimal"
          defaultValue={cuenta?.costoUsd ?? ''}
          placeholder="0.00"
          ayuda="Lo que te cuesta a ti."
          error={campos.costoUsd}
        />
        <Campo
          etiqueta="Próximo cobro del proveedor"
          name="facturaEn"
          type="date"
          defaultValue={cuenta?.facturaEn ?? ''}
          error={campos.facturaEn}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Cómo la pagas (opcional)"
          name="metodoPago"
          defaultValue={cuenta?.metodoPago ?? ''}
          placeholder="Tarjeta ···· 1234"
          maxLength={60}
          ayuda="Nunca el número completo de la tarjeta."
          error={campos.metodoPago}
        />
        <Campo
          etiqueta="Dónde se compró (opcional)"
          name="proveedor"
          defaultValue={cuenta?.proveedor ?? ''}
          maxLength={120}
          error={campos.proveedor}
        />
        <Campo
          etiqueta="País (opcional)"
          name="pais"
          defaultValue={cuenta?.pais ?? ''}
          placeholder="VE"
          maxLength={2}
          error={campos.pais}
        />
      </div>
      <AreaTexto
        etiqueta="Notas (opcional)"
        name="notas"
        defaultValue={cuenta?.notas ?? ''}
        rows={2}
        maxLength={1000}
        ayuda="No escribas aquí claves ni PIN: van cifrados en sus campos."
        error={campos.notas}
      />
    </>
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
}: {
  servicios: { id: string; nombre: string }[];
  /** Guardarla como «sin anotar»: en espera, sin asignar todavía. */
  enEspera?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<ModoCuenta>('perfiles');
  const [cantidad, setCantidad] = useState(5);
  const [verClave, setVerClave] = useState(false);
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
      setModo('perfiles');
      setCantidad(5);
      setVerClave(false);
    }
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Plus className="size-4" />}>
        {enEspera ? 'Agregar cuenta sin anotar' : 'Nueva cuenta'}
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
          <Selector etiqueta="Servicio" name="servicioId" required error={campos.servicioId}>
            <option value="">Elige un servicio</option>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Correo o usuario"
            name="usuario"
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={254}
            error={campos.usuario}
          />
          <div className="relative">
            <Campo
              etiqueta="Clave"
              name="clave"
              type={verClave ? 'text' : 'password'}
              required
              autoComplete="new-password"
              spellCheck={false}
              maxLength={200}
              error={campos.clave}
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              className="absolute top-8 right-2 rounded-lg p-1.5 text-tinta-tenue hover:text-tinta"
              aria-label={verClave ? 'Ocultar la clave' : 'Mostrar la clave'}
            >
              {verClave ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <DatosPerfiles cantidad={modo === 'completa' ? 1 : cantidad} campos={campos} />
        <DatosCuenta campos={campos} conLiberacion={enEspera} />
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

export function EditarCuenta({ cuenta }: { cuenta: CuentaServicioDetalle }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const usuario = textoDe(d, 'usuario');
    const clave = String(d.get('clave') ?? '');
    const r = await ejecutar('PATCH', `/cuentas/${cuenta.id}`, {
      estado: textoDe(d, 'estado'),
      ...(cuenta.modo === 'perfiles' ? { perfiles: textoDe(d, 'perfiles') } : {}),
      // Vacíos: se conservan el correo y la clave actuales.
      ...(usuario ? { usuario } : {}),
      ...(clave ? { clave } : {}),
      ...camposDatos(d),
    });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        variante="secundario"
        onClick={() => setAbierto(true)}
        icono={<Pencil className="size-4" />}
      >
        Editar cuenta
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Editar cuenta"
      descripcion="Deja vacíos el correo y la clave para conservarlos. Para quitar perfiles, deben estar libres los últimos."
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-5" noValidate autoComplete="off">
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
              etiqueta="Perfiles"
              name="perfiles"
              type="number"
              min={1}
              max={MAX_PERFILES_CUENTA}
              defaultValue={cuenta.perfiles.total}
              error={campos.perfiles}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Nuevo correo o usuario"
            name="usuario"
            autoComplete="off"
            spellCheck={false}
            placeholder={cuenta.pista}
            error={campos.usuario}
          />
          <Campo
            etiqueta="Nueva clave"
            name="clave"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            error={campos.clave}
          />
        </div>
        <DatosCuenta
          campos={campos}
          cuenta={cuenta}
          conLiberacion={cuenta.estado === 'en_espera'}
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Guardar cambios
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
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
                onClick={() =>
                  void ejecutar('POST', `/cuentas/${cuentaId}/perfiles/${perfil.id}/asignar`, {
                    suscripcionId: s.id,
                  })
                }
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
function ArmarMensaje({ cuentaId, perfil }: { cuentaId: string; perfil: PerfilCuentaPublico }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<MensajePerfil | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (abierto && d && !d.open) d.showModal();
  }, [abierto]);

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
                  Arma un mensaje con el correo, la clave
                  {perfil.tienePin ? ', el perfil y su PIN' : ' y el perfil'} para enviarlo tú. Nada
                  se envía solo. Queda registrado como ver credenciales.
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
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  cuentaActiva: boolean;
  /** Con `cuentas.revelar`: puede armar el mensaje con los datos del perfil. */
  puedeRevelar?: boolean;
}) {
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
          const r = await ejecutar('PATCH', ruta, {
            nombre: textoDe(d, 'nombre'),
            nota: String(d.get('nota') ?? '').trim() || null,
            ...(d.get('quitarPin') === 'on' ? { pin: null } : pin ? { pin } : {}),
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
        <Campo
          etiqueta={perfil.tienePin ? 'Nuevo PIN' : 'PIN (opcional)'}
          name="pin"
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
          error={campos.pin}
        />
        {perfil.tienePin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="quitarPin" /> Quitar el PIN
          </label>
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
        {perfil.estado === 'asignado' && (
          <Boton
            tamano="sm"
            variante={perfil.asignacion?.terminada ? 'secundario' : 'fantasma'}
            cargando={cargando}
            icono={<Unlink className="size-3.5" />}
            onClick={() => void ejecutar('POST', `${ruta}/liberar`)}
            aria-label={`Liberar ${perfil.nombre}`}
          >
            Liberar
          </Boton>
        )}
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
