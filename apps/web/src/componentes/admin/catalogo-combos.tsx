'use client';

import {
  type ComboPublico,
  MAX_PLANES_COMBO,
  MIN_PLANES_COMBO,
  type PlanPublico,
} from '@nv/shared';
import clsx from 'clsx';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { formatearMonto } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Porcentaje que ahorra el combo frente a sus planes por separado (en USD). */
function ahorroUsd(precio: number, suma: number): number | null {
  if (!(suma > 0) || !(precio > 0) || precio >= suma) return null;
  return Math.floor(((suma - precio) / suma) * 100);
}

function FormularioCombo({
  combo,
  planes,
  onListo,
}: {
  combo?: ComboPublico;
  planes: PlanPublico[];
  onListo: () => void;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [elegidos, setElegidos] = useState<string[]>(() => {
    const ids = combo?.planes.map((p) => p.id) ?? [];
    return ids.length >= MIN_PLANES_COMBO ? ids : [...ids, '', ''].slice(0, MIN_PLANES_COMBO);
  });
  const [precio, setPrecio] = useState(combo?.precioUsd ?? '');
  const suma = elegidos.reduce(
    (a, id) => a + Number(planes.find((p) => p.id === id)?.precioUsd ?? 0),
    0,
  );
  const pct = ahorroUsd(Number(precio.replace(',', '.')), suma);

  // Planes agrupados por servicio para el selector.
  const porServicio = new Map<string, PlanPublico[]>();
  for (const p of planes) {
    if (!p.activo) continue;
    const lista = porServicio.get(p.servicio.nombre) ?? [];
    lista.push(p);
    porServicio.set(p.servicio.nombre, lista);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const cuerpo = {
      nombre: textoDe(d, 'nombre') ?? '',
      descripcion: String(d.get('descripcion') ?? '').trim() || null,
      precioUsd: textoDe(d, 'precioUsd') ?? '',
      planes: elegidos.filter(Boolean),
      activo: d.get('activo') === 'on',
      orden: Number(d.get('orden') || 0),
    };
    const r = combo
      ? await ejecutar('PATCH', `/catalogo/combos/${combo.id}`, cuerpo)
      : await ejecutar('POST', '/catalogo/combos', cuerpo);
    if (r) onListo();
  }

  return (
    <form onSubmit={enviar} className="@container grid gap-4" noValidate>
      <div className="grid gap-4 @lg:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          maxLength={80}
          defaultValue={combo?.nombre}
          placeholder="Netflix + Spotify"
          error={campos.nombre}
        />
        <Campo
          etiqueta="Descripción corta"
          name="descripcion"
          maxLength={200}
          defaultValue={combo?.descripcion ?? ''}
          placeholder="Series y música, 1 mes"
          error={campos.descripcion}
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">
          Planes del combo · de {MIN_PLANES_COMBO} a {MAX_PLANES_COMBO}, de servicios distintos
        </legend>
        {elegidos.map((id, i) => (
          <div key={i} className="flex items-end gap-2">
            <Selector
              etiqueta={`Plan ${i + 1}`}
              className="flex-1"
              value={id}
              error={i === 0 ? campos.planes : undefined}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setElegidos((xs) => xs.map((x, j) => (j === i ? v : x)));
              }}
            >
              <option value="">Elige un plan</option>
              {[...porServicio].map(([servicio, lista]) => (
                <optgroup key={servicio} label={servicio}>
                  {lista.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.servicio.nombre} · {p.nombre} · {formatearMonto(p.precioUsd, 'USD')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Selector>
            {elegidos.length > MIN_PLANES_COMBO && (
              <Boton
                variante="fantasma"
                tamano="sm"
                aria-label={`Quitar el plan ${i + 1}`}
                icono={<Trash2 className="size-4" />}
                onClick={() => setElegidos((xs) => xs.filter((_, j) => j !== i))}
              />
            )}
          </div>
        ))}
        {elegidos.length < MAX_PLANES_COMBO && (
          <div>
            <Boton
              variante="fantasma"
              tamano="sm"
              icono={<Plus className="size-4" />}
              onClick={() => setElegidos((xs) => [...xs, ''])}
            >
              Añadir otro plan
            </Boton>
          </div>
        )}
      </fieldset>
      <div className="grid gap-4 @lg:grid-cols-2">
        <Campo
          etiqueta="Precio del combo (USD)"
          name="precioUsd"
          required
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.currentTarget.value)}
          error={campos.precioUsd}
          ayuda={
            suma > 0
              ? `Por separado: ${formatearMonto(suma.toFixed(2), 'USD')}${pct !== null ? ` · ahorra ${pct}%` : ' · tiene que ser menor'}`
              : 'Elige los planes para ver cuánto ahorra.'
          }
        />
        <Campo
          etiqueta="Orden en la tienda"
          name="orden"
          type="number"
          min={0}
          max={999}
          defaultValue={combo?.orden ?? 0}
          error={campos.orden}
          ayuda="Los de menor número salen primero."
        />
      </div>
      <Casilla
        name="activo"
        etiqueta="Activo"
        ayuda="Si lo desactivas, deja de verse en la tienda y su descuento no se aplica en el carrito."
        defaultChecked={combo?.activo ?? true}
      />
      <ErrorGeneral error={error} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando}>
          {combo ? 'Guardar cambios' : 'Crear combo'}
        </Boton>
        <Boton variante="fantasma" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function EliminarCombo({ combo }: { combo: ComboPublico }) {
  const [confirmar, setConfirmar] = useState(false);
  const { cargando, error, ejecutar } = useAccion();
  if (!confirmar) {
    return (
      <Boton
        variante="fantasma"
        tamano="sm"
        icono={<Trash2 className="size-3.5" />}
        onClick={() => setConfirmar(true)}
        aria-label={`Eliminar ${combo.nombre}`}
      >
        Eliminar
      </Boton>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">¿Eliminar este combo?</span>
      <Boton
        variante="peligro"
        tamano="sm"
        cargando={cargando}
        onClick={() => void ejecutar('DELETE', `/catalogo/combos/${combo.id}`)}
      >
        Sí, eliminar
      </Boton>
      <Boton variante="fantasma" tamano="sm" onClick={() => setConfirmar(false)}>
        No
      </Boton>
      <ErrorGeneral error={error} />
    </div>
  );
}

/** Combos del catálogo: crear, editar y eliminar. */
export function ListaCombos({
  combos,
  planes,
  puedeGestionar,
}: {
  combos: ComboPublico[];
  planes: PlanPublico[];
  puedeGestionar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const pocos = new Set(planes.filter((p) => p.activo).map((p) => p.servicio.id)).size < 2;
  const botonNuevo = (
    <Boton
      variante={combos.length === 0 ? 'secundario' : 'fantasma'}
      tamano={combos.length === 0 ? 'md' : 'sm'}
      icono={<Plus className="size-4" />}
      onClick={() => setEditando('nuevo')}
      disabled={pocos}
      title={pocos ? 'Necesitas planes de al menos dos servicios' : undefined}
    >
      Nuevo combo
    </Boton>
  );
  return (
    <>
      {puedeGestionar && editando === 'nuevo' && (
        <div className="border-b border-borde p-4 sm:p-5">
          <PanelFormulario
            titulo="Nuevo combo"
            descripcion="El descuento se aplica solo cuando el cliente tiene todos sus planes en el carrito."
            onCerrar={() => setEditando(null)}
          >
            <FormularioCombo planes={planes} onListo={() => setEditando(null)} />
          </PanelFormulario>
        </div>
      )}
      {combos.length === 0 ? (
        <EstadoVacio
          icono={Gift}
          titulo="Todavía no hay combos"
          accion={puedeGestionar && editando !== 'nuevo' ? botonNuevo : undefined}
        >
          Junta dos o más planes (por ejemplo Netflix + Spotify) con un precio especial. Se muestran
          en el bloque «Combos» del editor visual.
        </EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde">
          {combos.map((c) => {
            const suma = c.sinCombo.USD ? Number(c.sinCombo.USD) : 0;
            const pct = ahorroUsd(Number(c.precioUsd), suma);
            return (
              <li key={c.id} className="px-5 py-4 sm:px-6">
                {editando === c.id ? (
                  <PanelFormulario titulo={`Editar ${c.nombre}`} onCerrar={() => setEditando(null)}>
                    <FormularioCombo combo={c} planes={planes} onListo={() => setEditando(null)} />
                  </PanelFormulario>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx('font-medium', !c.activo && 'text-tinta-suave')}>
                          {c.nombre}
                        </span>
                        {!c.activo && <Insignia>Inactivo</Insignia>}
                        {pct !== null && <Insignia tono="exito">Ahorra {pct}%</Insignia>}
                      </div>
                      <p className="text-sm text-tinta-tenue">
                        {c.planes.map((p) => `${p.servicio.nombre} · ${p.nombre}`).join(' + ')}
                      </p>
                      <p className="text-sm tabular-nums">
                        <b>{formatearMonto(c.precioUsd, 'USD')}</b>
                        {suma > 0 && (
                          <span className="text-tinta-tenue">
                            {' '}
                            en vez de {formatearMonto(suma.toFixed(2), 'USD')}
                          </span>
                        )}
                      </p>
                    </div>
                    {puedeGestionar && (
                      <div className="flex flex-wrap gap-1">
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          icono={<Pencil className="size-3.5" />}
                          onClick={() => setEditando(c.id)}
                          aria-label={`Editar ${c.nombre}`}
                        >
                          Editar
                        </Boton>
                        <EliminarCombo combo={c} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {puedeGestionar && combos.length > 0 && editando !== 'nuevo' && (
        <div className="border-t border-borde px-5 py-3 sm:px-6">{botonNuevo}</div>
      )}
    </>
  );
}
