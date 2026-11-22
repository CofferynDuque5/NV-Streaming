'use client';

import type {
  NivelPublico,
  RecargaPublica,
  ResponsableGestor,
  ResultadoVincularResponsable,
} from '@nv/shared';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { formatearMonto } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

type NivelElegible = Pick<NivelPublico, 'id' | 'nombre' | 'activo'>;

/** Límite diario: vacío = sin límite (null). */
const leerLimite = (d: FormData) => textoDe(d, 'limiteDiarioCompras') ?? null;

function OpcionesNivel({ niveles, actual }: { niveles: NivelElegible[]; actual?: string | null }) {
  return (
    <>
      {niveles
        .filter((n) => n.activo || n.id === actual)
        .map((n) => (
          <option key={n.id} value={n.id}>
            {n.nombre}
            {n.activo ? '' : ' (inactivo)'}
          </option>
        ))}
    </>
  );
}

// ── Acción con motivo (rechazar, suspender, reactivar, reembolsar...) ───────

export function AccionConMotivo({
  ruta,
  boton,
  confirmar,
  etiqueta = 'Motivo',
  ayuda,
  placeholder,
  peligro = false,
  icono,
}: {
  ruta: string;
  boton: string;
  confirmar: string;
  etiqueta?: string;
  ayuda?: string;
  placeholder?: string;
  peligro?: boolean;
  icono?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', ruta, { motivo: textoDe(d, 'motivo') ?? '' });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante={peligro ? 'peligro' : 'secundario'}
        icono={icono}
        className="justify-self-start"
        onClick={() => {
          limpiar();
          setAbierto(true);
        }}
      >
        {boton}
      </Boton>
    );
  }
  return (
    <form
      onSubmit={enviar}
      className="grid w-full gap-3 rounded-xl border border-borde bg-hundida/60 p-4"
      noValidate
    >
      <AreaTexto
        etiqueta={etiqueta}
        name="motivo"
        rows={2}
        required
        autoFocus
        placeholder={placeholder}
        ayuda={ayuda}
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton
          type="submit"
          tamano="sm"
          variante={peligro ? 'peligro' : 'primario'}
          cargando={cargando}
        >
          {confirmar}
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

/** Aprobar (con nivel y límite) o rechazar una solicitud. */
export function RevisarSolicitud({
  revendedorId,
  nombre,
  niveles,
}: {
  revendedorId: string;
  nombre: string;
  niveles: NivelElegible[];
}) {
  const [aprobando, setAprobando] = useState(false);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();
  const activos = niveles.filter((n) => n.activo);

  async function aprobar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/revendedores/${revendedorId}/aprobar`, {
      nivelId: textoDe(d, 'nivelId') ?? '',
      limiteDiarioCompras: leerLimite(d),
    });
    if (r) setAprobando(false);
  }

  if (aprobando) {
    return (
      <form
        onSubmit={aprobar}
        className="grid w-full gap-3 rounded-xl border border-exito/25 bg-exito-suave/40 p-4"
        noValidate
      >
        <Selector
          etiqueta="Nivel"
          name="nivelId"
          required
          defaultValue={activos[0]?.id}
          error={campos.nivelId}
        >
          <OpcionesNivel niveles={activos} />
        </Selector>
        <Campo
          etiqueta="Límite de compras por día (opcional)"
          name="limiteDiarioCompras"
          inputMode="numeric"
          placeholder="Sin límite"
          error={campos.limiteDiarioCompras}
        />
        <p className="text-xs text-tinta-suave">
          {nombre} pasará a ser revendedor y se cerrarán sus sesiones abiertas. Sus datos de cliente
          se conservan.
        </p>
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" tamano="sm" cargando={cargando} icono={<Check className="size-4" />}>
            Aprobar revendedor
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={() => setAprobando(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {activos.length === 0 ? (
        <p className="text-xs text-aviso">Crea un nivel activo para poder aprobar.</p>
      ) : (
        <Boton
          tamano="sm"
          icono={<Check className="size-4" />}
          onClick={() => {
            limpiar();
            setAprobando(true);
          }}
        >
          Aprobar
        </Boton>
      )}
      <AccionConMotivo
        ruta={`/revendedores/${revendedorId}/rechazar`}
        boton="Rechazar"
        confirmar="Rechazar solicitud"
        etiqueta="Motivo del rechazo"
        ayuda={`${nombre} verá este motivo y podrá enviar la solicitud de nuevo.`}
        icono={<X className="size-4" />}
        peligro
      />
    </div>
  );
}

// ── Revendedor invitado sin ficha ────────────────────────────────────────────

/**
 * Para una cuenta con rol Revendedor que entró por invitación (sin solicitud): crea su
 * ficha ya aprobada con el nivel elegido y abre su ficha.
 */
export function CompletarFicha({
  usuarioId,
  nombre,
  niveles,
}: {
  usuarioId: string;
  nombre: string;
  niveles: NivelElegible[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();
  const activos = niveles.filter((n) => n.activo);

  async function completar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar<{ id: string }>(
      'POST',
      `/revendedores/sin-ficha/${usuarioId}/completar`,
      {
        nombreComercial: textoDe(d, 'nombreComercial') ?? '',
        telefono: textoDe(d, 'telefono'),
        nivelId: textoDe(d, 'nivelId') ?? '',
        limiteDiarioCompras: leerLimite(d),
      },
    );
    if (r) router.push(`/admin/revendedores/${r.datos.id}`);
  }

  if (activos.length === 0) {
    return <p className="text-xs text-aviso">Crea un nivel activo para completar su ficha.</p>;
  }
  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        icono={<Check className="size-4" />}
        onClick={() => {
          limpiar();
          setAbierto(true);
        }}
      >
        Completar ficha
      </Boton>
    );
  }
  return (
    <form
      onSubmit={completar}
      className="grid w-full gap-3 rounded-xl border border-exito/25 bg-exito-suave/40 p-4"
      noValidate
    >
      <Campo
        etiqueta="Nombre del negocio"
        name="nombreComercial"
        required
        defaultValue={nombre}
        error={campos.nombreComercial}
      />
      <Campo
        etiqueta="Teléfono (opcional)"
        name="telefono"
        inputMode="tel"
        error={campos.telefono}
      />
      <Selector
        etiqueta="Nivel"
        name="nivelId"
        required
        defaultValue={activos[0]?.id}
        error={campos.nivelId}
      >
        <OpcionesNivel niveles={activos} />
      </Selector>
      <Campo
        etiqueta="Límite de compras por día (opcional)"
        name="limiteDiarioCompras"
        inputMode="numeric"
        placeholder="Sin límite"
        error={campos.limiteDiarioCompras}
      />
      <p className="text-xs text-tinta-suave">
        Se crea su ficha ya aprobada. No cambia su contraseña ni cierra sus sesiones.
      </p>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" cargando={cargando} icono={<Check className="size-4" />}>
          Crear ficha
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ── Condiciones de un revendedor ─────────────────────────────────────────────

export function EditarCondiciones({
  revendedorId,
  nivelId,
  limiteDiarioCompras,
  niveles,
}: {
  revendedorId: string;
  nivelId: string | null;
  limiteDiarioCompras: number | null;
  niveles: NivelElegible[];
}) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('PATCH', `/revendedores/${revendedorId}`, {
      nivelId: textoDe(d, 'nivelId'),
      limiteDiarioCompras: leerLimite(d),
    });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        icono={<Pencil className="size-3.5" />}
        className="justify-self-start"
        onClick={() => setAbierto(true)}
      >
        Cambiar nivel o límite
      </Boton>
    );
  }
  return (
    <form onSubmit={guardar} className="grid w-full gap-3" noValidate>
      <Selector
        etiqueta="Nivel"
        name="nivelId"
        defaultValue={nivelId ?? ''}
        required
        error={campos.nivelId}
      >
        {!nivelId && <option value="">Elige un nivel</option>}
        <OpcionesNivel niveles={niveles} actual={nivelId} />
      </Selector>
      <Campo
        etiqueta="Límite de compras por día"
        name="limiteDiarioCompras"
        inputMode="numeric"
        placeholder="Sin límite"
        defaultValue={limiteDiarioCompras ?? ''}
        ayuda="Déjalo vacío para no limitar."
        error={campos.limiteDiarioCompras}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" cargando={cargando}>
          Guardar
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ── Saldo ────────────────────────────────────────────────────────────────────

export function AjustarSaldo({
  revendedorId,
  saldoUsd,
  ruta = `/revendedores/${revendedorId}/ajustes`,
  quienVe = 'el revendedor',
}: {
  revendedorId?: string;
  saldoUsd: string;
  /** Ruta de la API que registra el ajuste (revendedor o billetera de un cliente). */
  ruta?: string;
  quienVe?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', ruta, {
      montoUsd: textoDe(d, 'montoUsd') ?? '',
      motivo: textoDe(d, 'motivo') ?? '',
    });
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="secundario"
        className="justify-self-start"
        onClick={() => setAbierto(true)}
      >
        Ajustar saldo
      </Boton>
    );
  }
  return (
    <form onSubmit={enviar} className="grid w-full gap-3" noValidate>
      <Campo
        etiqueta="Importe en USD"
        name="montoUsd"
        inputMode="decimal"
        required
        autoFocus
        placeholder="Ej. 5 o -2.50"
        ayuda={`Positivo suma, negativo resta. Saldo actual: ${formatearMonto(saldoUsd, 'USD')}; no puede quedar por debajo de 0.`}
        error={campos.montoUsd}
      />
      <AreaTexto
        etiqueta="Motivo"
        name="motivo"
        rows={2}
        required
        placeholder="Ej. Compensación por una recarga duplicada."
        ayuda={`Queda en el historial y lo ve ${quienVe}.`}
        error={campos.motivo}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" cargando={cargando}>
          Registrar ajuste
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** Confirmar (con el monto que llegó) o rechazar una recarga en revisión. */
export function ConciliarRecarga({
  recarga,
  titular = recarga.revendedor?.nombre ?? 'El revendedor',
  base = '/recargas-saldo',
}: {
  recarga: Pick<RecargaPublica, 'id' | 'moneda' | 'montoDeclarado' | 'tasa'> & {
    revendedor?: { nombre: string };
  };
  /** Quién verá el motivo de un rechazo. */
  titular?: string;
  /** Ruta de la API de la cola (recargas de revendedores o de billeteras). */
  base?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [monto, setMonto] = useState(recarga.montoDeclarado);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();
  const usd = Number(monto.replace(',', '.')) / Number(recarga.tasa);

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `${base}/${recarga.id}/confirmar`, {
      montoRecibido: textoDe(d, 'montoRecibido') ?? '',
      notas: textoDe(d, 'notas'),
    });
    if (r) setConfirmando(false);
  }

  if (!confirmando) {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <Boton
          tamano="sm"
          icono={<Check className="size-4" />}
          onClick={() => {
            limpiar();
            setConfirmando(true);
          }}
        >
          Confirmar
        </Boton>
        <AccionConMotivo
          ruta={`${base}/${recarga.id}/rechazar`}
          boton="Rechazar"
          confirmar="Rechazar recarga"
          etiqueta="Motivo del rechazo"
          placeholder="Ej. No encontramos el pago en el banco."
          ayuda={`${titular} verá este motivo.`}
          icono={<X className="size-4" />}
          peligro
        />
      </div>
    );
  }
  return (
    <form
      onSubmit={confirmar}
      className="grid w-full gap-3 rounded-xl border border-exito/25 bg-exito-suave/40 p-4"
      noValidate
    >
      <Campo
        etiqueta={`Monto recibido (${recarga.moneda})`}
        name="montoRecibido"
        inputMode="decimal"
        required
        autoFocus
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        ayuda={
          Number.isFinite(usd) && usd > 0
            ? `Se acreditarán ${formatearMonto(usd.toFixed(2), 'USD')} (tasa fijada: ${recarga.tasa}).`
            : 'Lo que llegó a la cuenta.'
        }
        error={campos.montoRecibido}
      />
      <AreaTexto
        etiqueta="Notas (opcional)"
        name="notas"
        rows={2}
        ayuda="Solo las ve el equipo."
        error={campos.notas}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" cargando={cargando} icono={<Check className="size-4" />}>
          Confirmar recarga
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ── Niveles y precios ────────────────────────────────────────────────────────

function CamposNivel({
  nivel,
  campos,
}: {
  nivel?: NivelPublico;
  campos: Record<string, string | undefined>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          maxLength={60}
          defaultValue={nivel?.nombre}
          placeholder="Ej. Oro"
          error={campos.nombre}
        />
        <Campo
          etiqueta="Orden"
          name="orden"
          type="number"
          min={0}
          max={999}
          step={1}
          defaultValue={nivel?.orden ?? 0}
          ayuda="Menor aparece antes."
          error={campos.orden}
        />
      </div>
      <AreaTexto
        etiqueta="Descripción (opcional)"
        name="descripcion"
        rows={2}
        maxLength={300}
        defaultValue={nivel?.descripcion ?? ''}
        error={campos.descripcion}
      />
      <Campo
        etiqueta="Para llegar a este nivel (opcional)"
        name="requisito"
        maxLength={200}
        defaultValue={nivel?.requisito ?? ''}
        placeholder="Ej. Desde 20 ventas al mes"
        error={campos.requisito}
      />
      <AreaTexto
        etiqueta="Beneficios (uno por renglón)"
        name="beneficios"
        rows={4}
        defaultValue={nivel?.beneficios.join('\n') ?? ''}
        placeholder={
          'Ej.\nSoporte prioritario por WhatsApp\nReposición de cuentas en menos de 1 hora'
        }
        ayuda="Se muestran al revendedor y en la página de ganancias. Sus precios se ponen en la tabla de abajo."
        error={campos.beneficios}
      />
      <Casilla
        name="activo"
        defaultChecked={nivel?.activo ?? true}
        etiqueta="Activo"
        ayuda="Solo los niveles activos se pueden asignar. Desactivarlo no cambia a quien ya lo tiene."
      />
    </>
  );
}

function leerNivel(d: FormData) {
  return {
    nombre: textoDe(d, 'nombre') ?? '',
    descripcion: textoDe(d, 'descripcion') ?? null,
    requisito: textoDe(d, 'requisito') ?? null,
    beneficios: String(d.get('beneficios') ?? '')
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean),
    orden: textoDe(d, 'orden') ?? '0',
    activo: d.get('activo') === 'on',
  };
}

export function NuevoNivel() {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await ejecutar(
      'POST',
      '/revendedores/niveles',
      leerNivel(new FormData(e.currentTarget)),
    );
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton tamano="sm" icono={<Plus className="size-4" />} onClick={() => setAbierto(true)}>
        Nuevo nivel
      </Boton>
    );
  }
  return (
    <PanelFormulario titulo="Nuevo nivel" onCerrar={() => setAbierto(false)} className="w-full">
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <CamposNivel campos={campos} />
        <ErrorGeneral error={error} />
        <Boton type="submit" cargando={cargando} className="justify-self-start">
          Crear nivel
        </Boton>
      </form>
    </PanelFormulario>
  );
}

export function EditarNivel({ nivel }: { nivel: NivelPublico }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await ejecutar(
      'PATCH',
      `/revendedores/niveles/${nivel.id}`,
      leerNivel(new FormData(e.currentTarget)),
    );
    if (r) setAbierto(false);
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<Pencil className="size-3.5" />}
        onClick={() => setAbierto(true)}
        aria-label={`Editar nivel ${nivel.nombre}`}
      >
        Editar
      </Boton>
    );
  }
  return (
    <PanelFormulario
      titulo={`Editar ${nivel.nombre}`}
      onCerrar={() => setAbierto(false)}
      className="w-full"
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <CamposNivel nivel={nivel} campos={campos} />
        <ErrorGeneral error={error} />
        <Boton type="submit" cargando={cargando} className="justify-self-start">
          Guardar
        </Boton>
      </form>
    </PanelFormulario>
  );
}

/** Celda editable de la tabla de precios: vacío quita el precio para ese nivel. */
export function CeldaPrecio({
  planId,
  nivelId,
  descripcion,
  precio,
  costo,
  editable,
}: {
  planId: string;
  nivelId: string;
  descripcion: string;
  precio: string | null;
  costo: string | null;
  editable: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const { cargando, error, ejecutar, limpiar } = useAccion();

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = textoDe(new FormData(e.currentTarget), 'precioUsd') ?? null;
    const r = await ejecutar('PUT', '/revendedores/precios', { planId, nivelId, precioUsd: valor });
    if (r) setEditando(false);
  }

  const texto = precio ? formatearMonto(precio, 'USD') : '—';
  if (!editable) return <span className="tabular-nums">{texto}</span>;
  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          limpiar();
          setEditando(true);
        }}
        className="inline-flex h-9 min-w-20 items-center justify-end rounded-lg border border-transparent px-2 tabular-nums hover:border-borde hover:bg-hundida"
        aria-label={`Precio de ${descripcion}: ${precio ? texto : 'sin precio'}. Editar`}
      >
        {precio ? texto : <span className="text-tinta-tenue">Añadir</span>}
      </button>
    );
  }
  return (
    <form onSubmit={guardar} className="grid justify-items-end gap-1.5" noValidate>
      <label className="sr-only" htmlFor={`precio-${planId}-${nivelId}`}>
        Precio en USD de {descripcion}
      </label>
      <input
        id={`precio-${planId}-${nivelId}`}
        name="precioUsd"
        inputMode="decimal"
        defaultValue={precio ?? ''}
        placeholder="Sin precio"
        autoFocus
        className="h-9 w-24 rounded-lg border border-borde-fuerte bg-hundida px-2 text-right text-sm tabular-nums focus:border-marca focus:outline-none"
      />
      <div className="flex gap-1">
        <Boton type="submit" tamano="sm" cargando={cargando} aria-label="Guardar precio">
          <Check className="size-3.5" aria-hidden="true" />
        </Boton>
        <Boton
          tamano="sm"
          variante="fantasma"
          onClick={() => setEditando(false)}
          aria-label="Cancelar"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Boton>
      </div>
      {costo && (
        <p className="text-[0.7rem] text-tinta-tenue">Mínimo {formatearMonto(costo, 'USD')}</p>
      )}
      {error && <p className="max-w-40 text-right text-xs text-peligro">{error.mensaje}</p>}
    </form>
  );
}

// ── Clientes que ya tenía en el Gestor ───────────────────────────────────────

/**
 * Pasa a la cartera del revendedor los clientes que en el Gestor tenían su nombre como
 * responsable. Primero cuenta (vista previa) y luego aplica.
 */
export function TraerClientesGestor({
  revendedorId,
  responsables,
  sugerido,
}: {
  revendedorId: string;
  responsables: ResponsableGestor[];
  /** Nombre comercial del revendedor: marca los responsables que se le parecen. */
  sugerido: string;
}) {
  const { cargando, error, ejecutar, limpiar } = useAccion();
  const parecido = (r: string) => {
    const a = comparable(r);
    const b = comparable(sugerido);
    return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
  };
  const [elegidos, setElegidos] = useState<string[]>(() =>
    responsables.filter((r) => parecido(r.responsable)).map((r) => r.responsable),
  );
  const [previa, setPrevia] = useState<ResultadoVincularResponsable | null>(null);
  const [hecho, setHecho] = useState<ResultadoVincularResponsable | null>(null);

  async function enviar(aplicar: boolean) {
    const r = await ejecutar<ResultadoVincularResponsable>(
      'POST',
      `/revendedores/${revendedorId}/vincular-responsable`,
      { responsables: elegidos, aplicar },
    );
    if (!r) return;
    if (aplicar) {
      setHecho(r.datos);
      setPrevia(null);
      setElegidos([]);
    } else setPrevia(r.datos);
  }

  if (responsables.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">No quedan clientes del Gestor sin revendedor.</p>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-tinta-suave">
        Marca el nombre con el que aparecía en el Gestor (campo «Responsable»). Sus clientes y sus
        suscripciones pasan a su panel y ve sus accesos al entrar. No se borra nada.
      </p>
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-borde p-2">
        {responsables.map((r) => (
          <Casilla
            key={r.responsable}
            etiqueta={`${r.responsable} · ${r.clientes} ${r.clientes === 1 ? 'cliente' : 'clientes'}`}
            checked={elegidos.includes(r.responsable)}
            onChange={(e) => {
              limpiar();
              setPrevia(null);
              setHecho(null);
              const marcado = e.currentTarget.checked;
              setElegidos((l) =>
                marcado ? [...l, r.responsable] : l.filter((x) => x !== r.responsable),
              );
            }}
          />
        ))}
      </div>
      {previa && (
        <p className="rounded-xl border border-borde bg-hundida/60 p-3 text-sm">
          Pasarán <strong>{previa.clientes}</strong>{' '}
          {previa.clientes === 1 ? 'cliente' : 'clientes'} y <strong>{previa.suscripciones}</strong>{' '}
          {previa.suscripciones === 1 ? 'suscripción' : 'suscripciones'}.
          {previa.deOtroRevendedor > 0 &&
            ` ${previa.deOtroRevendedor} ya son de otro revendedor y no se tocan.`}
        </p>
      )}
      {hecho && (
        <p className="rounded-xl border border-exito/25 bg-exito-suave/40 p-3 text-sm">
          Listo: {hecho.clientes} {hecho.clientes === 1 ? 'cliente pasó' : 'clientes pasaron'} a su
          cartera con {hecho.suscripciones}{' '}
          {hecho.suscripciones === 1 ? 'suscripción' : 'suscripciones'}.
        </p>
      )}
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton
          tamano="sm"
          variante="secundario"
          disabled={elegidos.length === 0}
          cargando={cargando && !previa}
          onClick={() => void enviar(false)}
        >
          Ver cuántos son
        </Boton>
        {previa && previa.clientes > 0 && (
          <Boton
            tamano="sm"
            icono={<Check className="size-4" />}
            cargando={cargando}
            onClick={() => void enviar(true)}
          >
            Pasar a su cartera
          </Boton>
        )}
      </div>
    </div>
  );
}

const comparable = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bstr\.?$/, '')
    .replace(/[^a-z0-9]/g, '');
