'use client';

import {
  type ClienteDetalle,
  type Cotizacion,
  ETIQUETAS_ROL,
  type EstadoCliente,
  INFO_MONEDA,
  MONEDAS,
  type Moneda,
  type PlanPublico,
  type Rol,
} from '@nv/shared';
import { Calculator, PencilLine, Plus, ReceiptText, Send, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type FormEvent, type ReactNode, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearDuracion, formatearFecha, formatearMonto } from '@/lib/formato';
import { ListaDatos, nombrePais, ORIGEN_CLIENTE, PAISES_FRECUENTES } from './piezas-crm';

export interface Responsable {
  id: string;
  nombre: string;
  rol: Rol;
}

const texto = (d: FormData, campo: string) => {
  const v = d.get(campo);
  return typeof v === 'string' ? v.trim() : '';
};

function ErrorGeneral({ error }: { error: ErrorLlamada | null }) {
  if (!error || error.campos) return null;
  return <Alerta tono="peligro">{error.mensaje}</Alerta>;
}

/* ───────────────────────────── Campos reutilizados ───────────────────────────── */

function CampoPais({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const lista = useId();
  return (
    <>
      <Campo
        etiqueta="País"
        name="pais"
        defaultValue={defaultValue}
        maxLength={2}
        autoComplete="off"
        autoCapitalize="characters"
        list={lista}
        placeholder="VE"
        className="[&_input]:uppercase"
        ayuda="Código de 2 letras: VE Venezuela, CO Colombia, AR Argentina, PE Perú…"
        error={error}
      />
      <datalist id={lista}>
        {PAISES_FRECUENTES.map((p) => (
          <option key={p} value={p}>
            {nombrePais(p)}
          </option>
        ))}
      </datalist>
    </>
  );
}

function SelectorMoneda({
  etiqueta = 'Moneda preferida',
  error,
  ayuda,
  ...resto
}: Omit<ComponentProps<typeof Selector>, 'children' | 'etiqueta'> & { etiqueta?: string }) {
  return (
    <Selector etiqueta={etiqueta} error={error} ayuda={ayuda} {...resto}>
      {MONEDAS.map((m) => (
        <option key={m} value={m}>
          {m} · {INFO_MONEDA[m].nombre}
        </option>
      ))}
    </Selector>
  );
}

function SelectorResponsable({
  responsables,
  defaultValue,
  error,
}: {
  responsables: Responsable[];
  defaultValue: string;
  error?: string;
}) {
  const roles: Rol[] = ['ventas', 'operador', 'admin'];
  return (
    <Selector
      etiqueta="Responsable"
      name="asignadoAId"
      defaultValue={defaultValue}
      error={error}
      ayuda="Quien lleva la relación con el cliente. Ventas solo ve su cartera."
    >
      <option value="">Sin responsable</option>
      {roles.map((rol) => {
        const personas = responsables.filter((r) => r.rol === rol);
        if (personas.length === 0) return null;
        return (
          <optgroup key={rol} label={ETIQUETAS_ROL[rol]}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Selector>
  );
}

function CamposWhatsapp({
  defaultValue,
  consentimiento,
  error,
}: {
  defaultValue?: string;
  consentimiento?: boolean;
  error?: string;
}) {
  return (
    <div className="grid content-start gap-3">
      <Campo
        etiqueta="WhatsApp"
        name="whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="+58 412 1234567"
        defaultValue={defaultValue}
        ayuda="Con el código de país."
        error={error}
      />
      <Casilla
        name="aceptaWhatsapp"
        defaultChecked={consentimiento}
        etiqueta="Acepta recibir mensajes por WhatsApp"
        ayuda="Marca solo si el cliente lo autorizó. Guardamos la fecha del consentimiento."
      />
    </div>
  );
}

/* ───────────────────────────── Alta de cliente ───────────────────────────── */

/** Formulario de alta. Al crear, lleva al detalle del cliente. */
export function NuevoCliente({
  responsables,
  responsablePorDefecto,
}: {
  /** `null` si quien crea no puede elegir (ventas: se le asigna a sí mismo). */
  responsables: Responsable[] | null;
  responsablePorDefecto: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setCargando(true);
    setError(null);
    const r = await llamarApi<ClienteDetalle>('POST', '/clientes', {
      nombre: texto(d, 'nombre'),
      correo: texto(d, 'correo'),
      documento: texto(d, 'documento'),
      pais: texto(d, 'pais'),
      monedaPreferida: texto(d, 'monedaPreferida'),
      whatsapp: texto(d, 'whatsapp'),
      aceptaWhatsapp: d.get('aceptaWhatsapp') === 'on',
      ...(responsables ? { asignadoAId: texto(d, 'asignadoAId') } : {}),
    });
    if (!r.ok) {
      setCargando(false);
      return setError(r.error);
    }
    router.push(`/admin/clientes/${r.datos.id}`);
  }

  const campos = erroresPorCampo(error);
  return (
    <form onSubmit={enviar} className="grid gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre completo"
          name="nombre"
          required
          autoComplete="off"
          error={campos.nombre}
        />
        <Campo
          etiqueta="Correo"
          name="correo"
          type="email"
          autoComplete="off"
          ayuda="Opcional. Hace falta para invitarlo a su panel."
          error={campos.correo}
        />
        <Campo
          etiqueta="Documento"
          name="documento"
          autoComplete="off"
          ayuda="Opcional: cédula, DNI o pasaporte."
          error={campos.documento}
        />
        <CampoPais error={campos.pais} />
        <SelectorMoneda name="monedaPreferida" defaultValue="USD" error={campos.monedaPreferida} />
        <CamposWhatsapp error={campos.whatsapp} />
        {responsables ? (
          <SelectorResponsable
            responsables={responsables}
            defaultValue={
              responsables.some((r) => r.id === responsablePorDefecto) ? responsablePorDefecto : ''
            }
            error={campos.asignadoAId}
          />
        ) : (
          <Alerta tono="info" className="sm:col-span-2">
            El cliente quedará en tu cartera y serás su responsable.
          </Alerta>
        )}
      </div>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-5">
        <Boton type="submit" cargando={cargando} icono={<Plus className="size-4" />}>
          Crear cliente
        </Boton>
        <BotonEnlace href="/admin/clientes" variante="fantasma" scroll={false}>
          Cancelar
        </BotonEnlace>
      </div>
    </form>
  );
}

/* ───────────────────────────── Datos del cliente ───────────────────────────── */

/** Tarjeta de datos con edición en el sitio (PATCH). */
export function DatosCliente({
  cliente,
  puedeEditar,
  responsables,
}: {
  cliente: ClienteDetalle;
  puedeEditar: boolean;
  /** `null` si quien mira no puede reasignar (no tiene `usuarios.ver`). */
  responsables: Responsable[] | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const whatsapp = cliente.contactos.find((c) => c.tipo === 'whatsapp') ?? null;

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const numero = texto(d, 'whatsapp');
    const acepta = d.get('aceptaWhatsapp') === 'on';
    const cuerpo: Record<string, unknown> = {
      nombre: texto(d, 'nombre'),
      documento: texto(d, 'documento'),
      pais: texto(d, 'pais'),
      monedaPreferida: texto(d, 'monedaPreferida'),
    };
    // Si ya entra a su panel, el correo lo cambia él desde su cuenta.
    if (!cliente.usuario) cuerpo.correo = texto(d, 'correo');
    // Solo se reenvía el WhatsApp si cambió: al guardarlo se renueva la fecha del consentimiento.
    if (numero && (numero !== whatsapp?.valor || acepta !== Boolean(whatsapp?.consentimientoEn))) {
      cuerpo.whatsapp = numero;
      cuerpo.aceptaWhatsapp = acepta;
    }
    if (responsables) cuerpo.asignadoAId = texto(d, 'asignadoAId');

    setCargando(true);
    setError(null);
    setGuardado(false);
    const r = await llamarApi<ClienteDetalle>('PATCH', `/clientes/${cliente.id}`, cuerpo);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setEditando(false);
    setGuardado(true);
    router.refresh();
  }

  const campos = erroresPorCampo(error);
  const pais = nombrePais(cliente.pais);

  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Datos"
        accion={
          puedeEditar && !editando ? (
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<PencilLine className="size-4" />}
              onClick={() => {
                setEditando(true);
                setGuardado(false);
              }}
            >
              Editar
            </Boton>
          ) : undefined
        }
      />
      {editando ? (
        <form onSubmit={guardar} className="grid gap-4 px-5 py-5 sm:px-6" noValidate>
          <Campo
            etiqueta="Nombre completo"
            name="nombre"
            defaultValue={cliente.nombre}
            required
            error={campos.nombre}
          />
          <Campo
            etiqueta="Correo"
            name="correo"
            type="email"
            defaultValue={cliente.correo ?? ''}
            disabled={Boolean(cliente.usuario)}
            ayuda={
              cliente.usuario
                ? 'Ya entra a su panel con este correo: solo él puede cambiarlo desde su cuenta.'
                : undefined
            }
            error={campos.correo}
          />
          <Campo
            etiqueta="Documento"
            name="documento"
            defaultValue={cliente.documento ?? ''}
            error={campos.documento}
          />
          <CampoPais defaultValue={cliente.pais ?? ''} error={campos.pais} />
          <SelectorMoneda
            name="monedaPreferida"
            defaultValue={cliente.monedaPreferida}
            error={campos.monedaPreferida}
          />
          <CamposWhatsapp
            defaultValue={whatsapp?.valor ?? ''}
            consentimiento={Boolean(whatsapp?.consentimientoEn)}
            error={campos.whatsapp}
          />
          {responsables && (
            <SelectorResponsable
              responsables={responsables}
              defaultValue={cliente.asignadoA?.id ?? ''}
              error={campos.asignadoAId}
            />
          )}
          <ErrorGeneral error={error} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Boton type="submit" cargando={cargando}>
              Guardar cambios
            </Boton>
            <Boton
              variante="fantasma"
              onClick={() => {
                setEditando(false);
                setError(null);
              }}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <>
          <ListaDatos
            columnas={1}
            datos={[
              ['Correo', cliente.correo ?? <Vacio>Sin correo</Vacio>],
              ['Documento', cliente.documento ?? <Vacio>Sin documento</Vacio>],
              ['País', pais ? `${pais} (${cliente.pais})` : <Vacio>Sin indicar</Vacio>],
              [
                'Moneda preferida',
                `${cliente.monedaPreferida} · ${INFO_MONEDA[cliente.monedaPreferida].nombre}`,
              ],
              ['Responsable', cliente.asignadoA?.nombre ?? <Vacio>Sin responsable</Vacio>],
              ['Origen', ORIGEN_CLIENTE[cliente.origen] ?? cliente.origen],
              ['Cliente desde', formatearFecha(cliente.creadoEn)],
            ]}
          />
          {guardado && (
            <div className="px-5 pb-5 sm:px-6">
              <Alerta tono="exito">Datos guardados.</Alerta>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <span className="text-tinta-tenue">{children}</span>;
}

/* ───────────────────────────── Acceso al panel ───────────────────────────── */

export function InvitarCliente({ id, correo }: { id: string; correo: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  async function invitar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<ClienteDetalle>('POST', `/clientes/${id}/invitar`);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setEnviada(true);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {correo ? (
        <Boton
          variante="secundario"
          className="justify-self-start"
          cargando={cargando}
          icono={<Send className="size-4" />}
          onClick={() => void invitar()}
        >
          Invitar a su panel
        </Boton>
      ) : (
        <Alerta tono="aviso">
          Añade primero su correo en Datos: la invitación llega a ese correo.
        </Alerta>
      )}
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {enviada && correo && (
        <Alerta tono="exito">
          Enviamos la invitación a {correo}. Podrá crear su contraseña desde el enlace.
        </Alerta>
      )}
    </div>
  );
}

/* ───────────────────────────── Nueva suscripción ───────────────────────────── */

export function NuevaSuscripcion({
  clienteId,
  planes,
  monedaPreferida,
}: {
  clienteId: string;
  planes: PlanPublico[];
  monedaPreferida: Moneda;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [planId, setPlanId] = useState(planes[0]?.id ?? '');
  const [moneda, setMoneda] = useState<Moneda>(monedaPreferida);
  const [cupon, setCupon] = useState('');
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState<'cotizar' | 'crear' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  const plan = planes.find((p) => p.id === planId) ?? null;
  const precio = plan?.precios[moneda] ?? null;
  const cuerpo = () => ({ clienteId, planId, moneda, cupon: cupon.trim() || undefined });

  function cambiar<T>(fijar: (v: T) => void) {
    return (v: T) => {
      fijar(v);
      setCotizacion(null);
      setError(null);
    };
  }

  async function cotizar() {
    setCargando('cotizar');
    setError(null);
    const r = await llamarApi<Cotizacion>('POST', '/suscripciones/cotizar', cuerpo());
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setCotizacion(r.datos);
  }

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando('crear');
    setError(null);
    const r = await llamarApi<{ factura: { id: string } }>('POST', '/suscripciones', cuerpo());
    if (!r.ok) {
      setCargando(null);
      return setError(r.error);
    }
    router.push(`/admin/cobros/facturas/${r.datos.factura.id}`);
  }

  if (!abierto) {
    return (
      <div className="border-t border-borde px-5 py-4 sm:px-6">
        <Boton
          variante="secundario"
          icono={<Plus className="size-4" />}
          onClick={() => setAbierto(true)}
          disabled={planes.length === 0}
        >
          Nueva suscripción
        </Boton>
        {planes.length === 0 && (
          <p className="mt-2 text-xs text-tinta-tenue">
            No hay planes activos en el catálogo todavía.
          </p>
        )}
      </div>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <form
      onSubmit={crear}
      noValidate
      className="grid gap-5 border-t border-marca/25 bg-hundida/50 px-5 py-5 sm:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">Nueva suscripción</h3>
          <p className="text-sm text-tinta-suave">
            Se emite la factura al instante; el servicio se activa cuando se confirme el pago.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setCotizacion(null);
            setError(null);
          }}
          className="-mt-1 -mr-1 rounded-lg p-1.5 text-tinta-tenue hover:bg-hundida hover:text-tinta"
          aria-label="Cerrar el formulario de suscripción"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <Selector
        etiqueta="Plan"
        value={planId}
        onChange={(e) => cambiar(setPlanId)(e.target.value)}
        error={campos.planId}
      >
        {planes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.servicio.nombre} · {p.nombre} ·{' '}
            {formatearDuracion(p.duracionCantidad, p.duracionUnidad)} ·{' '}
            {formatearMonto(p.precioUsd, 'USD')}
          </option>
        ))}
      </Selector>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectorMoneda
          etiqueta="Moneda de la factura"
          value={moneda}
          onChange={(e) => cambiar(setMoneda)(e.target.value as Moneda)}
          error={campos.moneda}
          ayuda={
            precio
              ? `Precio de lista: ${formatearMonto(precio.precio, moneda)}${precio.fijo ? ' (fijo)' : ''}.`
              : undefined
          }
        />
        <Campo
          etiqueta="Cupón"
          value={cupon}
          onChange={(e) => cambiar(setCupon)(e.target.value.toUpperCase())}
          autoComplete="off"
          placeholder="Opcional"
          error={campos.cupon}
        />
      </div>

      {plan && !precio && (
        <Alerta tono="aviso">
          No hay tasa de cambio vigente para {moneda} ni precio fijo en este plan. Elige otra moneda
          o registra la tasa en Monedas y cobro.
        </Alerta>
      )}

      {cotizacion && (
        <div className="grid gap-2 rounded-xl border border-borde bg-superficie p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-tinta-suave">Subtotal</span>
            <span className="tabular-nums">
              {formatearMonto(cotizacion.subtotal, cotizacion.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-tinta-suave">
              Descuento{cotizacion.cupon ? ` (${cotizacion.cupon})` : ''}
            </span>
            <span className="text-exito tabular-nums">
              − {formatearMonto(cotizacion.descuento, cotizacion.moneda)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-borde pt-3">
            <span className="font-medium">Total a facturar</span>
            <span className="font-titulo text-xl font-semibold tabular-nums">
              {formatearMonto(cotizacion.total, cotizacion.moneda)}
            </span>
          </div>
        </div>
      )}

      <ErrorGeneral error={error} />

      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          icono={<Calculator className="size-4" />}
          cargando={cargando === 'cotizar'}
          disabled={!planId || cargando === 'crear'}
          onClick={() => void cotizar()}
        >
          Calcular
        </Boton>
        <Boton
          type="submit"
          icono={<ReceiptText className="size-4" />}
          cargando={cargando === 'crear'}
          disabled={!planId || cargando === 'cotizar'}
        >
          Crear y emitir factura
        </Boton>
      </div>
    </form>
  );
}

/* ───────────────────────────── Notas internas ───────────────────────────── */

export function NuevaNota({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/clientes/${clienteId}/notas`, { texto: texto(d, 'texto') });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    formulario.reset();
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="grid gap-3 px-5 py-5 sm:px-6" noValidate>
      <AreaTexto
        etiqueta="Nueva nota"
        name="texto"
        rows={3}
        maxLength={2000}
        placeholder="Acuerdos, preferencias, contexto para el resto del equipo…"
        ayuda="Solo la ve el equipo. No se puede editar ni borrar."
        error={erroresPorCampo(error).texto}
      />
      <ErrorGeneral error={error} />
      <Boton type="submit" variante="secundario" cargando={cargando} className="justify-self-start">
        Guardar nota
      </Boton>
    </form>
  );
}

/* ───────────────────────────── Archivar / reactivar ───────────────────────────── */

export function EstadoClienteAcciones({ id, estado }: { id: string; estado: EstadoCliente }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const archivar = estado === 'activo';

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/clientes/${id}/${archivar ? 'archivar' : 'reactivar'}`, {
      motivo: texto(d, 'motivo'),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    formulario.reset();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 px-5 py-5 sm:px-6" noValidate>
      <p className="text-sm text-tinta-suave">
        {archivar
          ? 'Lo saca de las listas y de las métricas. Antes cancela sus suscripciones activas o pendientes. El motivo queda en la auditoría.'
          : 'Vuelve a aparecer en las listas y se le pueden crear suscripciones.'}
      </p>
      <Campo etiqueta="Motivo" name="motivo" required error={erroresPorCampo(error).motivo} />
      <ErrorGeneral error={error} />
      <Boton
        type="submit"
        variante={archivar ? 'peligro' : 'secundario'}
        cargando={cargando}
        className="justify-self-start"
      >
        {archivar ? 'Archivar cliente' : 'Reactivar cliente'}
      </Boton>
    </form>
  );
}
