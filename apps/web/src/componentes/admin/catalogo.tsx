'use client';

import {
  CATEGORIAS_SERVICIO,
  ETIQUETA_TIPO_PLAN,
  esCompraUnica,
  INFO_CATEGORIA,
  INFO_MONEDA,
  type EntregaPlan,
  ENTREGAS_PLAN,
  ETIQUETA_ENTREGA_PLAN,
  type MonedaConTasa,
  type PlanPublico,
  type ProveedorPublico,
  type ServicioPublico,
  TIPOS_PLAN,
  TIPOS_PROVEEDOR,
  type TipoPlan,
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
import { formatearFechaHora, formatearMonto } from '@/lib/formato';
import { DatosRequeridosServicio, ImagenServicio, leerDatosRequeridos } from './catalogo-servicio';
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
    <form onSubmit={enviar} className="@container grid gap-4" noValidate>
      {/* Según el ancho de la tarjeta, no de la pantalla: en dos columnas del catálogo
          el nombre quedaba de 60 px. */}
      <div className="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_12rem]">
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
      categoria: String(d.get('categoria') ?? '') || null,
      imagenId: String(d.get('imagenId') ?? '') || null,
      datosRequeridos: leerDatosRequeridos(d),
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
    <form onSubmit={enviar} className="@container grid gap-4" noValidate>
      <div className="grid gap-4 @lg:grid-cols-2">
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
      <Selector
        etiqueta="Categoría en la tienda"
        name="categoria"
        defaultValue={servicio?.categoria ?? ''}
        error={campos.categoria}
        ayuda="El universo donde aparece en el menú y en el catálogo. Sin categoría solo sale en «Todo»."
      >
        <option value="">Sin categoría</option>
        {CATEGORIAS_SERVICIO.map((c) => (
          <option key={c} value={c}>
            {INFO_CATEGORIA[c].nombre}
          </option>
        ))}
      </Selector>
      <AreaTexto
        etiqueta="Descripción"
        name="descripcion"
        rows={2}
        defaultValue={servicio?.descripcion ?? ''}
        error={campos.descripcion}
        ayuda="Se muestra en la página del servicio en la tienda."
      />
      <ImagenServicio
        nombre={servicio?.nombre ?? slug}
        inicial={servicio?.imagen ?? null}
        error={campos.imagenId}
      />
      <DatosRequeridosServicio
        iniciales={servicio?.datosRequeridos ?? []}
        error={campos.datosRequeridos}
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
                      <span aria-hidden="true">·</span>
                      <span>
                        {s.categoria ? INFO_CATEGORIA[s.categoria].nombre : 'Sin categoría'}
                      </span>
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
  const [servicioId, setServicioId] = useState(servicios?.find((x) => x.activo)?.id ?? '');
  const categoria = servicios?.find((x) => x.id === servicioId)?.categoria ?? null;
  const [tipo, setTipo] = useState<TipoPlan>(plan?.tipo ?? 'suscripcion');
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
            value={servicioId}
            onChange={(e) => {
              const nuevo = e.currentTarget.value;
              setServicioId(nuevo);
              // Un juego casi nunca vende suscripciones: propone monedas.
              const esJuego = servicios.find((x) => x.id === nuevo)?.categoria === 'juegos';
              if (esJuego && tipo === 'suscripcion') setTipo('recarga');
            }}
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
          placeholder={esCompraUnica(tipo) ? 'Ej. 100 diamantes' : 'Ej. Premium mensual'}
          ayuda={
            esCompraUnica(tipo)
              ? 'Es lo que el cliente elige: la cantidad o el nombre del paquete.'
              : undefined
          }
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
      <PreciosYTipoPlan
        plan={plan}
        campos={campos}
        tipo={tipo}
        onTipo={setTipo}
        juego={categoria === 'juegos'}
      />
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

/**
 * Tipo de producto, precios y duración. Las compras únicas (recargas, paquetes,
 * pases, tarjetas) no tienen duración ni se renuevan, así que esos campos se
 * esconden.
 */
function PreciosYTipoPlan({
  plan,
  campos,
  tipo,
  onTipo: setTipo,
  juego,
}: {
  plan?: PlanPublico | undefined;
  campos: Record<string, string>;
  tipo: TipoPlan;
  onTipo: (t: TipoPlan) => void;
  juego: boolean;
}) {
  const unica = esCompraUnica(tipo);
  const [entrega, setEntrega] = useState<EntregaPlan>(plan?.entrega ?? 'alquiler');
  const revendedor = plan?.precioRevendedorUsd;
  return (
    <>
      <Selector
        etiqueta="Tipo de producto"
        name="tipo"
        value={tipo}
        onChange={(e) => setTipo(e.currentTarget.value as TipoPlan)}
        ayuda={
          unica
            ? 'Compra única: no tiene duración ni vence. En la tienda se agrupa en su pestaña (Monedas, Suministros, Paquetes, Pases o Tarjetas).'
            : juego
              ? 'Ojo: este servicio es un juego. Una suscripción se muestra como «1 mes»; para monedas o paquetes elige otro tipo.'
              : 'Tiene duración, vence y se puede renovar (cuentas y perfiles de streaming o música).'
        }
        error={campos.tipo}
      >
        {TIPOS_PLAN.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIPO_PLAN[t]}
          </option>
        ))}
      </Selector>
      {unica ? (
        <input type="hidden" name="entrega" value="alquiler" />
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-tinta">Cómo se entrega</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ENTREGAS_PLAN.map((v) => (
              <label
                key={v}
                className={clsx(
                  'flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm',
                  entrega === v ? 'border-acento bg-acento/10' : 'border-borde',
                )}
              >
                <input
                  type="radio"
                  name="entrega"
                  value={v}
                  checked={entrega === v}
                  onChange={() => setEntrega(v)}
                  className="mt-0.5"
                />
                <span>{ETIQUETA_ENTREGA_PLAN[v]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-tinta-tenue">
            {entrega === 'activacion'
              ? 'Al comprar, el cliente escribe el correo y la contraseña de su cuenta. La contraseña se guarda cifrada y se ve con «Ver datos» en la suscripción.'
              : 'Se entrega una cuenta o perfil que ya está en tu inventario.'}
          </p>
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Campo
          etiqueta="Precio normal (USD)"
          name="precioUsd"
          inputMode="decimal"
          required
          defaultValue={plan?.precioUsd}
          placeholder="0.00"
          ayuda="Lo ven los clientes."
          error={campos.precioUsd}
        />
        <Campo
          etiqueta="Precio revendedor (USD)"
          name="precioRevendedorUsd"
          inputMode="decimal"
          defaultValue={revendedor && revendedor !== 'varios' ? revendedor : ''}
          placeholder={revendedor === 'varios' ? 'Distinto por nivel' : 'Opcional'}
          ayuda={
            revendedor === 'varios'
              ? 'Cada nivel tiene su precio (Revendedores → Niveles). Escribe uno para igualarlos.'
              : 'Lo ven los revendedores al iniciar sesión. Vacío: no se vende a revendedores.'
          }
          error={campos.precioRevendedorUsd}
        />
        <Campo
          etiqueta="Costo en USD"
          name="costoUsd"
          inputMode="decimal"
          defaultValue={plan?.costoUsd ?? ''}
          placeholder="Opcional"
          ayuda="Lo que te cuesta. Mínimo para revendedores."
          error={campos.costoUsd}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {unica ? (
          <>
            <input type="hidden" name="duracionCantidad" value="1" />
            <input type="hidden" name="duracionUnidad" value="mes" />
          </>
        ) : (
          <>
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
          </>
        )}
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
      {!unica && (
        <Casilla
          name="renovable"
          etiqueta="Renovable"
          ayuda="Se puede renovar al vencer."
          defaultChecked={plan?.renovable ?? true}
        />
      )}
    </>
  );
}

function leerPlan(d: FormData, editando: boolean) {
  const descripcion = String(d.get('descripcion') ?? '').trim();
  const revendedor = textoDe(d, 'precioRevendedorUsd');
  return {
    tipo: d.get('tipo') ?? 'suscripcion',
    entrega: d.get('entrega') ?? 'alquiler',
    // Vacío al crear: no se vende a revendedores. Vacío al editar: se deja como está.
    ...(revendedor ? { precioRevendedorUsd: revendedor } : {}),
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

// ── Oferta HOT ───────────────────────────────────────────────────────────────

const HORA_MS = 3600_000;
const DURACIONES_OFERTA = [
  { texto: '24 horas', horas: 24 },
  { texto: '3 días', horas: 72 },
  { texto: '7 días', horas: 168 },
  { texto: '30 días', horas: 720 },
] as const;

/** Fecha para un <input type="datetime-local"> en la hora del navegador. */
function aLocal(fecha: Date): string {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Pone, cambia o quita la oferta HOT de un plan: porcentaje y fin. La oferta
 * rebaja la compra (no las renovaciones ni el precio a revendedores).
 */
export function OfertaPlan({ plan }: { plan: PlanPublico }) {
  const actual = plan.ofertaConfigurada ?? null;
  const [ahora] = useState(() => Date.now());
  const vigente = actual && new Date(actual.hasta).getTime() > ahora ? actual : null;
  const { cargando, error, campos, ejecutar, limpiar } = useAccion();
  const [porcentaje, setPorcentaje] = useState(vigente ? String(vigente.porcentaje) : '');
  const [hasta, setHasta] = useState(() =>
    aLocal(vigente ? new Date(vigente.hasta) : new Date(ahora + 72 * HORA_MS)),
  );
  const [aviso, setAviso] = useState<string | null>(null);

  const pct = Number(porcentaje);
  const pctValido = Number.isInteger(pct) && pct >= 1 && pct <= 90;
  const finValido = hasta !== '' && new Date(hasta).getTime() > ahora;
  const rebajado = pctValido ? (Number(plan.precioUsd) * (1 - pct / 100)).toFixed(2) : null;

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAviso(null);
    const r = await ejecutar('PUT', `/catalogo/planes/${plan.id}/oferta`, {
      porcentaje,
      hasta: hasta ? new Date(hasta).toISOString() : null,
    });
    if (r) setAviso('Oferta guardada: ya se ve en la tienda.');
  }

  async function quitar() {
    if (!window.confirm('¿Quitar la oferta? El plan vuelve a su precio normal.')) return;
    setAviso(null);
    const r = await ejecutar('PUT', `/catalogo/planes/${plan.id}/oferta`, { porcentaje: null });
    if (r) {
      setPorcentaje('');
      setAviso('Oferta quitada.');
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-4 px-5 py-5 sm:px-6" noValidate>
      {actual && !vigente && (
        <p className="text-sm text-tinta-suave">
          La última oferta ({actual.porcentaje} %) terminó el {formatearFechaHora(actual.hasta)}.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Campo
          etiqueta="Descuento (%)"
          name="porcentaje"
          inputMode="numeric"
          placeholder="Ej. 20"
          value={porcentaje}
          onChange={(e) => {
            limpiar();
            setPorcentaje(e.target.value.replace(/\D/g, '').slice(0, 2));
          }}
          error={
            campos.porcentaje ?? (porcentaje !== '' && !pctValido ? 'Entre 1 y 90 %.' : undefined)
          }
          valido={pctValido}
          ayuda={rebajado ? `Queda en ${formatearMonto(rebajado, 'USD')}` : undefined}
        />
        <div className="grid content-start gap-2">
          <Campo
            etiqueta="Termina"
            name="hasta"
            type="datetime-local"
            value={hasta}
            onChange={(e) => {
              limpiar();
              setHasta(e.target.value);
            }}
            error={campos.hasta ?? (hasta !== '' && !finValido ? 'La fecha ya pasó.' : undefined)}
            valido={finValido}
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duración rápida">
            {DURACIONES_OFERTA.map((d) => (
              <button
                key={d.horas}
                type="button"
                onClick={() => setHasta(aLocal(new Date(Date.now() + d.horas * HORA_MS)))}
                className="h-8 rounded-full border border-borde-fuerte px-3 text-xs font-medium whitespace-nowrap text-tinta-suave hover:border-marca hover:text-tinta"
              >
                {d.texto}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" cargando={cargando} disabled={!pctValido || !finValido}>
          {vigente ? 'Guardar oferta' : 'Poner en oferta'}
        </Boton>
        {vigente && (
          <Boton variante="fantasma" onClick={() => void quitar()} disabled={cargando}>
            Quitar oferta
          </Boton>
        )}
        {aviso && !cargando && (
          <p role="status" className="text-sm text-exito">
            {aviso}
          </p>
        )}
      </div>
    </form>
  );
}
