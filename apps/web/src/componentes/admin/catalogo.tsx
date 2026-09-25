'use client';

import {
  INFO_MONEDA,
  type MonedaConTasa,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
  TIPOS_PROVEEDOR,
  type TipoProveedor,
} from '@nv/shared';
import clsx from 'clsx';
import { Building2, Layers, PackageCheck, Pencil, Plus, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { formatearMonto } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

export const ETIQUETA_TIPO_PROVEEDOR: Record<TipoProveedor, string> = {
  propio: 'Propio',
  distribuidor: 'Distribuidor',
};

export function InsigniaTipoProveedor({ tipo }: { tipo: TipoProveedor }) {
  return (
    <Insignia tono={tipo === 'propio' ? 'marca' : 'acento'}>
      {ETIQUETA_TIPO_PROVEEDOR[tipo]}
    </Insignia>
  );
}

const marcada = (d: FormData, nombre: string) => d.get(nombre) === 'on';

// ── Proveedores ──────────────────────────────────────────────────────────────

function FormularioProveedor({
  proveedor,
  onListo,
}: {
  proveedor?: ProveedorPublico;
  onListo: () => void;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const notas = String(d.get('notasAcuerdo') ?? '').trim();
    const cuerpo = {
      nombre: textoDe(d, 'nombre') ?? '',
      tipo: d.get('tipo'),
      permiteReventa: marcada(d, 'permiteReventa'),
      activo: marcada(d, 'activo'),
      // Al editar se envía vacío para poder borrar las notas.
      notasAcuerdo: proveedor ? notas : notas || undefined,
    };
    const r = proveedor
      ? await ejecutar('PATCH', `/catalogo/proveedores/${proveedor.id}`, cuerpo)
      : await ejecutar('POST', '/catalogo/proveedores', cuerpo);
    if (r) onListo();
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          defaultValue={proveedor?.nombre}
          error={campos.nombre}
        />
        <Selector
          etiqueta="Tipo"
          name="tipo"
          defaultValue={proveedor?.tipo ?? 'propio'}
          error={campos.tipo}
        >
          {TIPOS_PROVEEDOR.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_PROVEEDOR[t]}
            </option>
          ))}
        </Selector>
      </div>
      <AreaTexto
        etiqueta="Notas del acuerdo"
        name="notasAcuerdo"
        rows={3}
        defaultValue={proveedor?.notasAcuerdo ?? ''}
        ayuda="Condiciones, contacto o plazos pactados. Solo las ve el equipo."
        error={campos.notasAcuerdo}
      />
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Casilla
          name="permiteReventa"
          etiqueta="Permite reventa"
          ayuda="Sus planes podrán ofrecerse a revendedores."
          defaultChecked={proveedor?.permiteReventa ?? false}
        />
        <Casilla
          name="activo"
          etiqueta="Activo"
          ayuda="Si lo desactivas, sus planes dejan de venderse."
          defaultChecked={proveedor?.activo ?? true}
        />
      </div>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          {proveedor ? 'Guardar cambios' : 'Crear proveedor'}
        </Boton>
        <Boton variante="fantasma" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

export function ListaProveedores({
  proveedores,
  puedeGestionar,
}: {
  proveedores: ProveedorPublico[];
  puedeGestionar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <>
      {puedeGestionar && editando === 'nuevo' && (
        <div className="border-b border-borde p-4 sm:p-5">
          <PanelFormulario titulo="Nuevo proveedor" onCerrar={() => setEditando(null)}>
            <FormularioProveedor onListo={() => setEditando(null)} />
          </PanelFormulario>
        </div>
      )}
      {proveedores.length === 0 ? (
        <EstadoVacio
          icono={Building2}
          titulo="Todavía no hay proveedores"
          accion={
            puedeGestionar && editando !== 'nuevo' ? (
              <Boton
                variante="secundario"
                icono={<Plus className="size-4" />}
                onClick={() => setEditando('nuevo')}
              >
                Añadir proveedor
              </Boton>
            ) : undefined
          }
        >
          Un proveedor es quien presta el servicio: NV misma o un distribuidor con quien hay un
          acuerdo.
        </EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde">
          {proveedores.map((p) => (
            <li key={p.id} className="px-5 py-4 sm:px-6">
              {editando === p.id ? (
                <PanelFormulario titulo={`Editar ${p.nombre}`} onCerrar={() => setEditando(null)}>
                  <FormularioProveedor proveedor={p} onListo={() => setEditando(null)} />
                </PanelFormulario>
              ) : (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={clsx('font-medium', !p.activo && 'text-tinta-suave')}>
                        {p.nombre}
                      </span>
                      <InsigniaTipoProveedor tipo={p.tipo} />
                      {p.permiteReventa && <Insignia tono="exito">Permite reventa</Insignia>}
                      {!p.activo && <Insignia>Inactivo</Insignia>}
                    </div>
                    {p.notasAcuerdo ? (
                      <p className="line-clamp-2 text-sm text-tinta-suave">{p.notasAcuerdo}</p>
                    ) : (
                      <p className="text-sm text-tinta-tenue">Sin notas del acuerdo.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-tinta-tenue tabular-nums">
                      {p.servicios === 1 ? '1 servicio' : `${p.servicios} servicios`}
                    </span>
                    <Link
                      href={`/admin/catalogo/proveedores/${p.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-marca hover:bg-hundida focus-visible:outline-2 focus-visible:outline-marca"
                      aria-label={`Entrega de ${p.nombre}`}
                    >
                      <PackageCheck className="size-3.5" aria-hidden="true" />
                      Entrega
                    </Link>
                    {puedeGestionar && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        icono={<Pencil className="size-3.5" />}
                        onClick={() => setEditando(p.id)}
                        aria-label={`Editar ${p.nombre}`}
                      >
                        Editar
                      </Boton>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeGestionar && proveedores.length > 0 && editando !== 'nuevo' && (
        <div className="border-t border-borde px-5 py-3 sm:px-6">
          <Boton
            variante="fantasma"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={() => setEditando('nuevo')}
          >
            Añadir proveedor
          </Boton>
        </div>
      )}
    </>
  );
}

// ── Servicios ────────────────────────────────────────────────────────────────

const aSlug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

function FormularioServicio({
  servicio,
  proveedores,
  onListo,
}: {
  servicio?: ServicioPublico;
  proveedores: ProveedorPublico[];
  onListo: () => void;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [slug, setSlug] = useState(servicio?.slug ?? '');
  const [slugTocado, setSlugTocado] = useState(Boolean(servicio));

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const descripcion = String(d.get('descripcion') ?? '').trim();
    const comun = {
      nombre: textoDe(d, 'nombre') ?? '',
      slug: textoDe(d, 'slug') ?? '',
      descripcion: servicio ? descripcion : descripcion || undefined,
      activo: marcada(d, 'activo'),
    };
    const r = servicio
      ? await ejecutar('PATCH', `/catalogo/servicios/${servicio.id}`, comun)
      : await ejecutar('POST', '/catalogo/servicios', {
          ...comun,
          proveedorId: d.get('proveedorId'),
        });
    if (r) onListo();
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          defaultValue={servicio?.nombre}
          error={campos.nombre}
          onChange={(e) => {
            if (!slugTocado) setSlug(aSlug(e.currentTarget.value));
          }}
        />
        <Campo
          etiqueta="Identificador (slug)"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTocado(true);
            setSlug(e.currentTarget.value);
          }}
          ayuda="Aparece en las direcciones web. Minúsculas, números y guiones."
          error={campos.slug}
          spellCheck={false}
          autoCapitalize="off"
        />
      </div>
      {servicio ? (
        <p className="text-sm text-tinta-suave">
          Proveedor: <span className="text-tinta">{servicio.proveedor.nombre}</span>. El proveedor
          de un servicio no se cambia después de crearlo.
        </p>
      ) : (
        <Selector
          etiqueta="Proveedor"
          name="proveedorId"
          defaultValue={proveedores.find((p) => p.activo)?.id ?? ''}
          error={campos.proveedorId}
        >
          <option value="" disabled>
            Elige un proveedor
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · {ETIQUETA_TIPO_PROVEEDOR[p.tipo]}
              {p.activo ? '' : ' (inactivo)'}
            </option>
          ))}
        </Selector>
      )}
      <AreaTexto
        etiqueta="Descripción"
        name="descripcion"
        rows={2}
        defaultValue={servicio?.descripcion ?? ''}
        error={campos.descripcion}
      />
      <Casilla
        name="activo"
        etiqueta="Activo"
        ayuda="Si lo desactivas, sus planes dejan de venderse."
        defaultChecked={servicio?.activo ?? true}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          {servicio ? 'Guardar cambios' : 'Crear servicio'}
        </Boton>
        <Boton variante="fantasma" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

export function ListaServicios({
  servicios,
  proveedores,
  puedeGestionar,
}: {
  servicios: ServicioPublico[];
  proveedores: ProveedorPublico[];
  puedeGestionar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const sinProveedores = proveedores.length === 0;

  const botonNuevo = (
    <Boton
      variante={servicios.length === 0 ? 'secundario' : 'fantasma'}
      tamano={servicios.length === 0 ? 'md' : 'sm'}
      icono={<Plus className="size-4" />}
      onClick={() => setEditando('nuevo')}
      disabled={sinProveedores}
      title={sinProveedores ? 'Primero crea un proveedor' : undefined}
    >
      Añadir servicio
    </Boton>
  );

  return (
    <>
      {puedeGestionar && editando === 'nuevo' && (
        <div className="border-b border-borde p-4 sm:p-5">
          <PanelFormulario titulo="Nuevo servicio" onCerrar={() => setEditando(null)}>
            <FormularioServicio proveedores={proveedores} onListo={() => setEditando(null)} />
          </PanelFormulario>
        </div>
      )}
      {servicios.length === 0 ? (
        <EstadoVacio
          icono={Layers}
          titulo="Todavía no hay servicios"
          accion={puedeGestionar && editando !== 'nuevo' ? botonNuevo : undefined}
        >
          {sinProveedores
            ? 'Crea primero un proveedor; después podrás añadir sus servicios.'
            : 'Un servicio agrupa los planes que vendes de un mismo producto.'}
        </EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde">
          {servicios.map((s) => (
            <li key={s.id} className="px-5 py-4 sm:px-6">
              {editando === s.id ? (
                <PanelFormulario titulo={`Editar ${s.nombre}`} onCerrar={() => setEditando(null)}>
                  <FormularioServicio
                    servicio={s}
                    proveedores={proveedores}
                    onListo={() => setEditando(null)}
                  />
                </PanelFormulario>
              ) : (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={clsx('font-medium', !s.activo && 'text-tinta-suave')}>
                        {s.nombre}
                      </span>
                      {!s.activo && <Insignia>Inactivo</Insignia>}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-tinta-tenue">
                      <code className="font-mono text-xs text-tinta-suave">{s.slug}</code>
                      <span aria-hidden="true">·</span>
                      <span>{s.proveedor.nombre}</span>
                    </p>
                  </div>
                  {puedeGestionar && (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      icono={<Pencil className="size-3.5" />}
                      onClick={() => setEditando(s.id)}
                      aria-label={`Editar ${s.nombre}`}
                    >
                      Editar
                    </Boton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeGestionar && servicios.length > 0 && editando !== 'nuevo' && (
        <div className="border-t border-borde px-5 py-3 sm:px-6">{botonNuevo}</div>
      )}
    </>
  );
}

// ── Planes ───────────────────────────────────────────────────────────────────

function CamposPlan({
  plan,
  servicios,
  campos,
}: {
  plan?: PlanPublico;
  servicios?: ServicioPublico[];
  campos: Record<string, string>;
}) {
  const errorBeneficios =
    campos.beneficios ??
    Object.entries(campos).find(([k]) => k.startsWith('beneficios.'))?.[1] ??
    undefined;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {servicios && (
          <Selector
            etiqueta="Servicio"
            name="servicioId"
            defaultValue={servicios.find((s) => s.activo)?.id ?? ''}
            error={campos.servicioId}
          >
            <option value="" disabled>
              Elige un servicio
            </option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {s.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </Selector>
        )}
        <Campo
          etiqueta="Nombre del plan"
          name="nombre"
          required
          defaultValue={plan?.nombre}
          placeholder="Ej. Premium mensual"
          error={campos.nombre}
          className={servicios ? undefined : 'sm:col-span-2'}
        />
      </div>
      <AreaTexto
        etiqueta="Descripción"
        name="descripcion"
        rows={2}
        defaultValue={plan?.descripcion ?? ''}
        ayuda="Una frase que el cliente verá junto al plan."
        error={campos.descripcion}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Campo
          etiqueta="Precio en USD"
          name="precioUsd"
          inputMode="decimal"
          required
          defaultValue={plan?.precioUsd}
          placeholder="0.00"
          error={campos.precioUsd}
        />
        <Campo
          etiqueta="Costo en USD"
          name="costoUsd"
          inputMode="decimal"
          defaultValue={plan?.costoUsd ?? ''}
          placeholder="Opcional"
          ayuda="Mínimo para revendedores."
          error={campos.costoUsd}
        />
        <Campo
          etiqueta="Duración"
          name="duracionCantidad"
          type="number"
          min={1}
          max={365}
          required
          defaultValue={plan?.duracionCantidad ?? 1}
          error={campos.duracionCantidad}
        />
        <Selector
          etiqueta="Unidad"
          name="duracionUnidad"
          defaultValue={plan?.duracionUnidad ?? 'mes'}
          error={campos.duracionUnidad}
        >
          <option value="mes">Meses</option>
          <option value="dia">Días</option>
        </Selector>
        <Campo
          etiqueta="Orden"
          name="orden"
          type="number"
          min={0}
          max={999}
          defaultValue={plan?.orden ?? 0}
          ayuda="Menor aparece antes."
          error={campos.orden}
        />
      </div>
      <Campo
        etiqueta="Referencia en el proveedor (SKU)"
        name="skuProveedor"
        defaultValue={plan?.skuProveedor ?? ''}
        placeholder="Opcional"
        ayuda="Código del plan en el sistema del proveedor. Se envía en el webhook de entrega."
        error={campos.skuProveedor}
        spellCheck={false}
        autoCapitalize="off"
      />
      <AreaTexto
        etiqueta="Beneficios"
        name="beneficios"
        rows={4}
        defaultValue={plan?.beneficios.join('\n') ?? ''}
        placeholder={'Calidad 4K\nHasta 4 pantallas'}
        ayuda="Uno por línea, hasta 12."
        error={errorBeneficios}
      />
      <fieldset className="grid gap-3 rounded-xl border border-borde bg-hundida/50 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Opciones</legend>
        <Casilla
          name="visible"
          etiqueta="Visible en el catálogo"
          ayuda="Si está oculto, solo el equipo puede asignarlo."
          defaultChecked={plan?.visible ?? true}
        />
        <Casilla
          name="renovable"
          etiqueta="Renovable"
          ayuda="Se puede renovar al vencer."
          defaultChecked={plan?.renovable ?? true}
        />
        <Casilla
          name="revendible"
          etiqueta="Revendible"
          ayuda="Se puede vender a revendedores con precio mayorista."
          defaultChecked={plan?.revendible ?? false}
        />
        {plan && (
          <Casilla
            name="activo"
            etiqueta="Activo"
            ayuda="Si lo desactivas, deja de venderse; las suscripciones actuales siguen."
            defaultChecked={plan.activo}
          />
        )}
      </fieldset>
    </>
  );
}

function leerPlan(d: FormData, editando: boolean) {
  const descripcion = String(d.get('descripcion') ?? '').trim();
  return {
    nombre: textoDe(d, 'nombre') ?? '',
    descripcion: editando ? descripcion : descripcion || undefined,
    precioUsd: textoDe(d, 'precioUsd') ?? '',
    // Vacío al editar quita el costo; al crear, simplemente no se envía.
    costoUsd: textoDe(d, 'costoUsd') ?? (editando ? null : undefined),
    skuProveedor: textoDe(d, 'skuProveedor') ?? (editando ? null : undefined),
    duracionCantidad: textoDe(d, 'duracionCantidad') ?? '',
    duracionUnidad: d.get('duracionUnidad'),
    beneficios: String(d.get('beneficios') ?? '')
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean),
    visible: marcada(d, 'visible'),
    renovable: marcada(d, 'renovable'),
    revendible: marcada(d, 'revendible'),
    orden: textoDe(d, 'orden') ?? '0',
    ...(editando ? { activo: marcada(d, 'activo') } : {}),
  };
}

export function NuevoPlan({ servicios }: { servicios: ServicioPublico[] }) {
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const r = await ejecutar('POST', '/catalogo/planes', {
      ...leerPlan(d, false),
      servicioId: d.get('servicioId'),
    });
    if (r) {
      formulario.reset();
      setAbierto(false);
    }
  }

  if (!abierto) {
    return (
      <Boton
        onClick={() => setAbierto(true)}
        icono={<Plus className="size-4" />}
        disabled={servicios.length === 0}
        title={servicios.length === 0 ? 'Primero crea un servicio' : undefined}
      >
        Nuevo plan
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Nuevo plan"
      descripcion="El precio se fija en USD; en las demás monedas se calcula con la tasa del día."
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <CamposPlan servicios={servicios} campos={campos} />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Crear plan
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

export function EditarPlan({ plan }: { plan: PlanPublico }) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [guardado, setGuardado] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardado(false);
    const r = await ejecutar('PATCH', `/catalogo/planes/${plan.id}`, {
      ...leerPlan(new FormData(e.currentTarget), true),
    });
    if (r) setGuardado(true);
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 px-5 py-5 sm:px-6" noValidate>
      <CamposPlan plan={plan} campos={campos} />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" cargando={cargando}>
          Guardar cambios
        </Boton>
        {guardado && !cargando && (
          <p role="status" className="text-sm text-exito">
            Cambios guardados.
          </p>
        )}
      </div>
    </form>
  );
}

// ── Precio por moneda ────────────────────────────────────────────────────────

const clasesEntradaCompacta =
  'h-9 w-full min-w-0 rounded-lg border border-borde-fuerte bg-hundida px-3 text-sm text-tinta tabular-nums placeholder:text-tinta-tenue hover:border-tinta-tenue focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca-suave aria-invalid:border-peligro';

/** Controles de una fila de la tabla "Precio por moneda". */
export function PrecioMoneda({
  planId,
  moneda,
  actual,
}: {
  planId: string;
  moneda: MonedaConTasa;
  actual: { precio: string; fijo: boolean } | null;
}) {
  const id = useId();
  const [fijando, setFijando] = useState(false);
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();

  async function fijar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const precio = textoDe(new FormData(e.currentTarget), 'precio') ?? '';
    const r = await ejecutar('PUT', `/catalogo/planes/${planId}/precio`, { moneda, precio });
    if (r) setFijando(false);
  }

  async function volverATasa() {
    if (
      !window.confirm(
        `¿Quitar el precio fijo en ${moneda}? El plan volverá a seguir la tasa del día.`,
      )
    )
      return;
    await ejecutar('PUT', `/catalogo/planes/${planId}/precio`, { moneda, precio: null });
  }

  if (fijando) {
    return (
      <form onSubmit={fijar} className="grid gap-1.5" noValidate>
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="sr-only">
            Precio fijo en {INFO_MONEDA[moneda].nombre}
          </label>
          <input
            id={id}
            name="precio"
            inputMode="decimal"
            autoFocus
            defaultValue={actual?.fijo ? actual.precio : ''}
            placeholder={`Precio en ${moneda}`}
            aria-invalid={campos.precio ? true : undefined}
            aria-describedby={campos.precio ? `${id}-error` : undefined}
            className={clsx(clasesEntradaCompacta, 'w-36')}
          />
          <Boton type="submit" tamano="sm" cargando={cargando}>
            Fijar
          </Boton>
          <Boton
            tamano="sm"
            variante="fantasma"
            onClick={() => {
              limpiar();
              setFijando(false);
            }}
          >
            Cancelar
          </Boton>
        </div>
        {campos.precio && (
          <p id={`${id}-error`} className="text-xs font-medium text-peligro">
            {campos.precio}
          </p>
        )}
        {error && !error.campos && <p className="text-xs text-peligro">{error.mensaje}</p>}
      </form>
    );
  }

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Boton
          tamano="sm"
          variante="secundario"
          icono={<Pencil className="size-3.5" />}
          onClick={() => setFijando(true)}
          aria-label={`${actual?.fijo ? 'Cambiar precio fijo' : 'Fijar precio'} en ${moneda}`}
        >
          {actual?.fijo ? 'Cambiar' : 'Fijar precio'}
        </Boton>
        {actual?.fijo && (
          <Boton
            tamano="sm"
            variante="fantasma"
            icono={<RotateCcw className="size-3.5" />}
            onClick={() => void volverATasa()}
            cargando={cargando}
            aria-label={`Volver a la tasa en ${moneda}`}
          >
            Volver a la tasa
          </Boton>
        )}
      </div>
      {error && <p className="text-xs text-peligro">{error.mensaje}</p>}
    </div>
  );
}

/** Precio de un plan en una moneda, con su origen (fijo o sin tasa). Sirve en servidor y cliente. */
export function CeldaPrecio({
  moneda,
  valor,
}: {
  moneda: MonedaConTasa;
  valor: { precio: string; fijo: boolean } | null;
}) {
  if (!valor) return <span className="text-xs text-aviso">Sin tasa</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
      {formatearMonto(valor.precio, moneda)}
      {valor.fijo && (
        <Insignia tono="acento" className="px-1.5 py-0 text-[0.65rem]">
          Fijo
        </Insignia>
      )}
    </span>
  );
}
