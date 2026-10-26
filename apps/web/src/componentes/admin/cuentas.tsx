'use client';

import {
  type CredencialesCuenta,
  type CuentaServicioDetalle,
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
  Link2,
  Lock,
  Pencil,
  Plus,
  Search,
  Unlink,
  Unlock,
} from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { BotonCopiar } from '@/componentes/accesos';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import { formatearFecha } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Campos comunes de alta y edición (sin credenciales). */
function camposDatos(d: FormData) {
  return {
    plan: textoDe(d, 'plan') ?? null,
    pais: textoDe(d, 'pais') ?? null,
    costoUsd: textoDe(d, 'costoUsd') ?? '0',
    facturaEn: textoDe(d, 'facturaEn') ?? null,
    metodoPago: textoDe(d, 'metodoPago') ?? null,
    proveedor: textoDe(d, 'proveedor') ?? null,
    notas: textoDe(d, 'notas') ?? null,
  };
}

function DatosCuenta({
  campos,
  cuenta,
}: {
  campos: Record<string, string>;
  cuenta?: CuentaServicioDetalle;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Plan de la cuenta (opcional)"
          name="plan"
          defaultValue={cuenta?.plan ?? ''}
          placeholder="Premium 4 pantallas"
          maxLength={60}
          error={campos.plan}
        />
        <Campo
          etiqueta="Costo mensual (USD)"
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

export function NuevaCuenta({ servicios }: { servicios: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<ModoCuenta>('perfiles');
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
      ...camposDatos(d),
    });
    if (r) {
      setCreada(r.datos.pista);
      formulario.reset();
      setModo('perfiles');
      setVerClave(false);
    }
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Plus className="size-4" />}>
        Nueva cuenta
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Nueva cuenta de servicio"
      descripcion="El correo, la clave y los PIN se guardan cifrados. En las listas solo se ve una pista del correo."
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
              defaultValue={5}
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
        <DatosCuenta campos={campos} />
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
        <DatosCuenta campos={campos} cuenta={cuenta} />
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
export function AccionesPerfil({
  cuentaId,
  perfil,
  cuentaActiva,
}: {
  cuentaId: string;
  perfil: PerfilCuentaPublico;
  cuentaActiva: boolean;
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
